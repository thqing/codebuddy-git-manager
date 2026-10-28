/**
 * Local browser preview for the Webview without launching CodeBuddy.
 *
 *   npm run preview -- --repo /path/to/repository
 *
 * It binds to 127.0.0.1 only, reuses the real Git engine, and emulates the
 * `acquireVsCodeApi` message bridge. Never ship this endpoint in the extension.
 */
import http from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGitHost, failureOf } from '../src/host.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const repository = process.argv.includes('--repo')
  ? process.argv[process.argv.indexOf('--repo') + 1]
  : path.resolve(root, '..')
const port = Number(process.env.PORT) || 4173

const host = createGitHost({
  getConfig: () => ({
    repos: [repository],
    maxCommits: 400,
    timeoutMs: 60_000,
    networkTimeoutMs: 180_000,
  }),
  getWorkspaceRegistry: () => ({
    list: () => [{ path: repository, title: path.basename(repository) }],
  }),
  logger: console,
})

const previewBridge = `
  <script>
    window.acquireVsCodeApi = () => ({
      postMessage(message) {
        if (message.type === 'git-request') {
          fetch('/rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(message.payload),
          }).then(async (response) => {
            const body = await response.json()
            window.postMessage({ type: 'git-response', id: message.id, ...body }, '*')
          }).catch((error) => {
            window.postMessage({
              type: 'git-response',
              id: message.id,
              ok: false,
              message: error.message,
            }, '*')
          })
        } else if (message.type === 'copy') {
          navigator.clipboard?.writeText(message.text).catch(() => {})
        }
      },
    })
  </script>`

const html = readFileSync(path.join(root, 'media/webview.html'), 'utf8')
  .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/u, '')
  .replace('</head>', `${previewBridge}\n</head>`)
  .replaceAll('__CSP_SOURCE__', "'self'")
  .replaceAll('__NONCE__', 'preview')
  .replaceAll('__SCRIPT_URI__', '/webview.js')
  .replaceAll('__LANG__', 'zh-CN')

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(html)
    return
  }

  if (request.method === 'GET' && request.url === '/webview.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    response.end(readFileSync(path.join(root, 'dist/webview.js')))
    return
  }

  if (request.method === 'POST' && request.url === '/rpc') {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        const data = await host.run(payload)
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ ok: true, data }))
      } catch (error) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(failureOf(error)))
      }
    })
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Git Manager preview: http://127.0.0.1:${port}/`)
  console.log(`Repository: ${repository}`)
})
