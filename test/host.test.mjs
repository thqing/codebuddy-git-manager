/**
 * Host wiring tests: drive `apply()` with a fake Cordis context and exercise the
 * registered Fetch route and agent tool the way the Client and the model do.
 * Run with: node --test dsh-git-manager/test/host.test.mjs
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'
import { runGit } from '../git.js'

let root
let routes
let tools

function fakeContext() {
  const context = {
    get: () => undefined,
    logger: { warn: () => {} },
    inject(deps, callback) {
      if (deps.includes('connection')) {
        callback({
          connection: {
            fetch: {
              register(route) {
                routes.push(route)
                return () => {}
              },
            },
          },
        })
      }
      if (deps.includes('tools')) {
        callback({
          tools: {
            register(definition) {
              tools.push(definition)
              return () => {}
            },
          },
        })
      }
    },
  }
  return context
}

function post(body) {
  return routes[0].fetch(new Request('http://127.0.0.1:1/api/dsh-git', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

before(async () => {
  routes = []
  tools = []
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-git-host-'))
  await runGit(root, ['init', '-q', '-b', 'main'])
  await runGit(root, ['config', 'user.name', 'Host Tester'])
  await runGit(root, ['config', 'user.email', 'host@example.com'])
  await fsp.writeFile(path.join(root, 'readme.md'), '# hi\n', 'utf8')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'init'])
  apply(fakeContext(), { repos: [root] })
})

after(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true })
})

test('apply registers one authenticated POST route and one agent tool', () => {
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/api/dsh-git')
  assert.deepEqual(routes[0].methods, ['POST'])
  assert.equal(routes[0].requestBody, 'buffered')
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'git_manage')
})

test('the route answers a successful read', async () => {
  const response = await post({ op: 'status', repo: root })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.data.status.branch, 'main')
  assert.equal(body.data.status.files.length, 0)
})

test('the route reports a git failure as an envelope, not a transport error', async () => {
  const response = await post({ op: 'status', repo: '/definitely/not/here' })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.code, 'git')
  assert.match(body.message, /目录不存在|不是 Git 仓库/)
})

test('a malformed body is a 400', async () => {
  const response = await post('{not json')
  assert.equal(response.status, 400)
  assert.equal((await response.json()).ok, false)
})

test('mutating operations are serialized and observed', async () => {
  await fsp.writeFile(path.join(root, 'a.txt'), 'one\n', 'utf8')
  const [staged, committed] = await Promise.all([
    post({ op: 'stage', repo: root, paths: ['a.txt'] }).then((r) => r.json()),
    post({ op: 'status', repo: root }).then((r) => r.json()),
  ])
  assert.equal(staged.ok, true)
  assert.equal(committed.ok, true)
  const commit = await post({ op: 'commitStaged', repo: root, message: 'add a' }).then((r) => r.json())
  assert.equal(commit.ok, true)
  const history = await post({ op: 'log', repo: root }).then((r) => r.json())
  assert.equal(history.data.commits.length, 2)
  assert.equal(history.data.commits[0].subject, 'add a')
})

test('the agent tool returns a summary and the same data', async () => {
  const result = await tools[0].execute({ action: 'branches', repo: root })
  assert.equal(result.ok, true)
  assert.match(result.summary, /本地分支 1 个/)
  assert.equal(result.data.head, 'main')
  const rendered = tools[0].output.render({}, result)
  assert.deepEqual(rendered, [{ type: 'text', text: result.summary }])
})

test('the agent tool rejects an unknown action', async () => {
  await assert.rejects(tools[0].execute({ action: 'nope' }), /未知 action/)
})
