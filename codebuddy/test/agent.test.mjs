import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, toPayload } from '../src/agent.js'

test('tool input maps to the engine operation and forwards arguments', () => {
  assert.deepEqual(toPayload({
    action: 'commit_staged',
    repo: '/repo',
    message: 'feat: save',
    unknown: 'ignored',
  }, '/default'), {
    op: 'commitStaged',
    repo: '/repo',
    message: 'feat: save',
  })
})

test('the tool uses the current workspace as the default repository', () => {
  assert.deepEqual(toPayload({ action: 'status' }, '/workspace'), {
    op: 'status',
    repo: '/workspace',
  })
})

test('an unknown tool action is rejected before touching Git', () => {
  assert.throws(() => toPayload({ action: 'not-real' }), /未知 action/)
})

test('tool summaries match the DSH agent wording', () => {
  assert.match(summarize('status', {
    status: { branch: 'main', files: [{ path: 'a' }] },
  }), /当前分支 main，变更 1 个/)
  assert.match(summarize('log', { commits: [{}, {}] }), /2 条提交/)
  assert.match(summarize('update_project', {
    updated: true,
    strategy: 'rebase',
    upstream: 'origin/main',
    behind: 3,
    branch: 'main',
  }), /变基到 main/)
})
