/**
 * Extension-host smoke test without launching CodeBuddy/VS Code.
 *
 * The generated extension is CommonJS and requests the `vscode` module. We
 * intercept that one module with a small API fake, then drive activation, the
 * open command, the Webview message bridge and clipboard forwarding.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.resolve(here, '..')
const originalLoad = Module._load

let captured
let panel
let extension
let context

function disposable() {
  return { dispose() {} }
}

function fakeVscode() {
  captured = {
    commands: new Map(),
    serializer: null,
    status: null,
    panels: [],
    messages: [],
    clipboard: '',
  }

  class Uri {
    constructor(value) {
      this.value = value
    }

    toString() {
      return this.value
    }

    static joinPath(base, ...parts) {
      return new Uri([base.value, ...parts].join('/'))
    }
  }

  function createPanel() {
    let onMessage = null
    let onDispose = null
    const webview = {
      options: null,
      html: '',
      cspSource: 'vscode-webview:',
      asWebviewUri(uri) {
        return new Uri(`vscode-webview:${uri.value}`)
      },
      postMessage(message) {
        captured.messages.push(message)
        return Promise.resolve(true)
      },
      onDidReceiveMessage(callback) {
        onMessage = callback
        return disposable()
      },
    }
    const created = {
      webview,
      title: '',
      iconPath: null,
      reveal() {},
      onDidDispose(callback) {
        onDispose = callback
        return disposable()
      },
      dispose() {
        onDispose?.()
      },
      send(message) {
        onMessage?.(message)
      },
    }
    captured.panels.push(created)
    return created
  }

  return {
    Uri,
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Active: -1 },
    env: {
      language: 'zh-cn',
      clipboard: {
        async writeText(value) {
          captured.clipboard = value
        },
      },
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration() {
        return {
          get(_key, fallback) {
            return fallback
          },
        }
      },
    },
    commands: {
      registerCommand(name, callback) {
        captured.commands.set(name, callback)
        return disposable()
      },
    },
    window: {
      createOutputChannel() {
        return {
          appendLine() {},
          dispose() {},
        }
      },
      createStatusBarItem() {
        captured.status = {
          name: '',
          text: '',
          tooltip: '',
          command: '',
          show() {},
          dispose() {},
        }
        return captured.status
      },
      createWebviewPanel() {
        panel = createPanel()
        return panel
      },
      registerWebviewPanelSerializer(_type, serializer) {
        captured.serializer = serializer
        return disposable()
      },
    },
  }
}

before(() => {
  const vscode = fakeVscode()
  Module._load = function load(request, parent, isMain) {
    if (request === 'vscode') return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  extension = require('../dist/extension.cjs')
  context = {
    subscriptions: [],
    extensionUri: new vscode.Uri(extensionRoot),
    asAbsolutePath(relative) {
      return path.join(extensionRoot, relative)
    },
  }
  extension.activate(context)
})

after(() => {
  Module._load = originalLoad
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

test('activation registers the open command, serializer and status bar', () => {
  assert.equal(captured.commands.has('codebuddyGitManager.open'), true)
  assert.ok(captured.serializer)
  assert.equal(captured.status.command, 'codebuddyGitManager.open')
  assert.match(captured.status.text, /Git/)
  assert.ok(context.subscriptions.length >= 4)
})

test('the open command creates a CSP-compliant Webview with the shared UI bundle', async () => {
  await captured.commands.get('codebuddyGitManager.open')()
  assert.equal(captured.panels.length, 1)
  assert.equal(panel.title, 'Git 管理')
  assert.match(panel.webview.html, /Content-Security-Policy/)
  assert.match(panel.webview.html, /nonce=/)
  assert.match(panel.webview.html, /dist\/webview\.js/)
  assert.match(panel.webview.html, /--dsw-alias-label-primary/)
  assert.doesNotMatch(panel.webview.html, /__NONCE__|__SCRIPT_URI__|__CSP_SOURCE__/)
  assert.equal(panel.webview.options.enableScripts, true)
})

test('the Webview RPC bridge executes the shared Git host', async () => {
  panel.send({ type: 'git-request', id: '7', payload: { op: 'capabilities' } })
  await tick()
  const response = captured.messages.find((message) => message.type === 'git-response' && message.id === '7')
  assert.ok(response)
  assert.equal(response.ok, true)
  assert.ok(response.data.ops.includes('squash'))
})

test('clipboard requests are handled by the extension host', async () => {
  panel.send({ type: 'copy', text: 'abc123' })
  await tick()
  assert.equal(captured.clipboard, 'abc123')
})

test('the open command reveals an existing panel instead of duplicating it', async () => {
  await captured.commands.get('codebuddyGitManager.open')()
  assert.equal(captured.panels.length, 1)
})
