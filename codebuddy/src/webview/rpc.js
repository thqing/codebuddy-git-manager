/**
 * Small request/response bridge between the Webview and the extension host.
 * Every request gets a monotonically increasing id; late or duplicate responses
 * are ignored. No DSH or VS Code API is needed here, so it is unit-testable.
 */
export function createRpcClient({ postMessage, timeoutMs = 10 * 60_000 } = {}) {
  const pending = new Map()
  let sequence = 0

  function settle(id, error, data) {
    const entry = pending.get(id)
    if (!entry) return false
    pending.delete(id)
    clearTimeout(entry.timer)
    if (error) entry.reject(error)
    else entry.resolve(data)
    return true
  }

  function request(payload) {
    return new Promise((resolve, reject) => {
      const id = String(++sequence)
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Git 请求超时（${Math.round(timeoutMs / 1000)} 秒）`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      try {
        postMessage({ type: 'git-request', id, payload })
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      }
    })
  }

  function handleMessage(event) {
    const message = event && typeof event === 'object' && 'data' in event ? event.data : event
    if (!message || message.type !== 'git-response') return false
    const id = String(message.id)
    if (message.ok === true) return settle(id, null, message.data)
    const error = new Error(message.message || '未知错误')
    error.detail = typeof message.detail === 'string' ? message.detail : ''
    error.code = message.code ?? 'internal'
    return settle(id, error)
  }

  function dispose() {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error('Git 宿主连接已关闭'))
      pending.delete(id)
    }
  }

  return { request, handleMessage, dispose }
}
