/**
 * Host adapter tests: exercise the exact dispatcher used by the Webview RPC
 * bridge against a real temporary Git repository.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGitHost, createQueue, failureOf } from '../src/host.js'
import { runGit } from '../../git.js'

let root
let host

before(async () => {
  root = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'codebuddy-git-host-')))
  await runGit(root, ['init', '-q', '-b', 'main'])
  await runGit(root, ['config', 'user.name', 'CodeBuddy Tester'])
  await runGit(root, ['config', 'user.email', 'codebuddy@example.com'])
  await fsp.writeFile(path.join(root, 'readme.md'), '# hello\n', 'utf8')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'init'])
  host = createGitHost({
    getConfig: () => ({ repos: [], maxCommits: 50, timeoutMs: 20_000, networkTimeoutMs: 60_000 }),
    getWorkspaceRegistry: () => ({
      list: () => [{ path: root, title: 'Temporary' }],
    }),
    logger: { error: () => {} },
  })
})

after(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true })
})

test('discover includes the VS Code workspace folder', async () => {
  const data = await host.run({ op: 'discover' })
  assert.equal(data.repos.length, 1)
  assert.equal(data.repos[0].path, root)
  assert.equal(data.repos[0].isRepo, true)
  assert.equal(data.repos[0].branch, 'main')
})

test('snapshot returns status, history and branch data', async () => {
  const data = await host.run({ op: 'snapshot', repo: root, max: 20 })
  assert.equal(data.status.branch, 'main')
  assert.equal(data.log.commits.length, 1)
  assert.equal(data.log.commits[0].subject, 'init')
  assert.ok(Array.isArray(data.branches.local))
  assert.ok(data.identity.userName)
})

test('a git failure can be converted to a Webview envelope', async () => {
  await assert.rejects(host.run({ op: 'status', repo: path.join(root, 'missing') }))
  try {
    await host.run({ op: 'status', repo: path.join(root, 'missing') })
  } catch (error) {
    const failure = failureOf(error)
    assert.equal(failure.ok, false)
    assert.equal(failure.code, 'git')
    assert.match(failure.message, /目录不存在|不是 Git 仓库/)
  }
})

test('reword rewrites the message through the extension host', async () => {
  const before = await host.run({ op: 'snapshot', repo: root, max: 20 })
  const head = before.log.commits[0].hash
  assert.equal(before.log.commits[0].pushed, false, 'a repository without remotes has no published commits')
  const data = await host.run({ op: 'reword', repo: root, sha: head, message: 'init (rewritten)' })
  assert.equal(data.changed, true)
  assert.equal(data.subject, 'init (rewritten)')
  const after = await host.run({ op: 'snapshot', repo: root, max: 20 })
  assert.equal(after.log.commits[0].subject, 'init (rewritten)')
})

test('mutations are serialized per repository', async () => {
  const enqueue = createQueue()
  let active = 0
  let peak = 0
  const job = () => enqueue('repo-a', async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 15))
    active -= 1
  })
  await Promise.all([job(), job(), job()])
  assert.equal(peak, 1)
})
