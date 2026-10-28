import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRpcClient } from '../src/webview/rpc.js'

test('a request resolves with the matching host response', async () => {
  const posted = []
  const rpc = createRpcClient({ postMessage: (message) => posted.push(message) })
  const promise = rpc.request({ op: 'status', repo: '/repo' })
  assert.equal(posted.length, 1)
  assert.equal(posted[0].type, 'git-request')
  assert.deepEqual(posted[0].payload, { op: 'status', repo: '/repo' })
  rpc.handleMessage({ data: {
    type: 'git-response',
    id: posted[0].id,
    ok: true,
    data: { status: { branch: 'main' } },
  } })
  assert.deepEqual(await promise, { status: { branch: 'main' } })
})

test('a failure response rejects with message, detail and code', async () => {
  const posted = []
  const rpc = createRpcClient({ postMessage: (message) => posted.push(message) })
  const promise = rpc.request({ op: 'stage' })
  rpc.handleMessage({
    type: 'git-response',
    id: posted[0].id,
    ok: false,
    message: 'git failed',
    detail: 'git add',
    code: 'git',
  })
  await assert.rejects(promise, (error) => {
    assert.equal(error.message, 'git failed')
    assert.equal(error.detail, 'git add')
    assert.equal(error.code, 'git')
    return true
  })
})

test('unknown and duplicate responses are ignored', async () => {
  const posted = []
  const rpc = createRpcClient({ postMessage: (message) => posted.push(message) })
  const promise = rpc.request({ op: 'status' })
  assert.equal(rpc.handleMessage({ data: { type: 'git-response', id: 'missing', ok: true, data: 1 } }), false)
  assert.equal(rpc.handleMessage({ data: { type: 'git-response', id: posted[0].id, ok: true, data: 1 } }), true)
  assert.equal(rpc.handleMessage({ data: { type: 'git-response', id: posted[0].id, ok: true, data: 2 } }), false)
  assert.equal(await promise, 1)
})

test('a request times out and is removed from the pending map', async () => {
  const rpc = createRpcClient({ postMessage: () => {}, timeoutMs: 10 })
  await assert.rejects(rpc.request({ op: 'status' }), /超时/)
})

test('dispose rejects all pending requests', async () => {
  const rpc = createRpcClient({ postMessage: () => {} })
  const promise = rpc.request({ op: 'status' })
  rpc.dispose()
  await assert.rejects(promise, /连接已关闭/)
})
