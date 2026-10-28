/**
 * CodeBuddy/VS Code Webview bootstrap.
 *
 * The shared `client.js` still uses its DSH module-loader entry. We provide a
 * tiny loader shim, inject the Webview RPC bridge through the two optional hooks
 * added to the shared panel, and mount the registered `main` component with
 * React instead of a DSH slot host.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../../client.js'
import { createRpcClient } from './rpc.js'

const vscode = acquireVsCodeApi()
const rpc = createRpcClient({
  postMessage: (message) => vscode.postMessage(message),
})
window.addEventListener('message', (event) => {
  rpc.handleMessage(event)
})

globalThis.__DSH_GIT_CALL__ = (payload) => rpc.request(payload)
globalThis.__DSH_GIT_COPY__ = (text) => {
  vscode.postMessage({ type: 'copy', text: String(text ?? '') })
}

function translateFactory(dictionaries) {
  const language = String(document.documentElement.lang || 'en').toLowerCase()
  const preferred = language.startsWith('zh') ? 'zh' : 'en'
  const selected = dictionaries.get(preferred) ?? dictionaries.get('en') ?? {}
  const fallback = dictionaries.get('zh') ?? {}
  return (key) => selected[key] ?? fallback[key] ?? key
}

function showBootError(error) {
  const root = document.getElementById('root')
  if (!root) return
  const message = error instanceof Error ? error.message : String(error)
  root.innerHTML = `<div class="boot-error"><strong>Git Manager failed to start</strong><pre></pre></div>`
  const pre = root.querySelector('pre')
  if (pre) pre.textContent = message
  try {
    vscode.postMessage({ type: 'log', text: `webview boot failed: ${message}` })
  } catch {
    // Best-effort diagnostics only.
  }
}

function boot() {
  const definition = globalThis.__DSH_GIT_DEFINITION__
  if (!definition || typeof definition.factory !== 'function') {
    throw new Error('共享 UI 未注册：window.__DSH_GIT_DEFINITION__ 不存在')
  }

  const dictionaries = new Map()
  const registrations = []
  const moduleExports = definition.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected module request: ${name}`)
  })

  const context = {
    effect(factory) {
      try {
        const disposable = factory()
        return typeof disposable === 'function' ? disposable : () => {}
      } catch {
        return () => {}
      }
    },
    logger: {
      warn(message) {
        console.warn(message)
      },
    },
    locale: {
      register(_namespace, language, dictionary) {
        dictionaries.set(language, dictionary)
        return () => {}
      },
      bind() {
        return translateFactory(dictionaries)
      },
    },
    slots: {
      inject(_name, callback) {
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }

  moduleExports.apply(context)
  const main = registrations.find((entry) => entry.options?.name === 'main')
  if (!main) throw new Error('共享 UI 没有注册 main 面板')

  const t = translateFactory(dictionaries)
  createRoot(document.getElementById('root')).render(
    React.createElement(main.component, { t }),
  )
}

try {
  boot()
} catch (error) {
  showBootError(error)
}
