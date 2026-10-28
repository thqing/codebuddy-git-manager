import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createGitHost, failureOf } from './host.js'
import { summarize, toPayload } from './agent.js'

const PANEL_TYPE = 'codebuddyGitManager.panel'
const TOOL_NAME = 'codebuddyGitManager_gitManage'
const SETTINGS_NS = 'codebuddyGitManager'

let activePanel
let gitHost
let extensionContext
let output

/** Read the extension settings on every call so changes apply without reload. */
function readSettings() {
  const config = vscode.workspace.getConfiguration(SETTINGS_NS)
  return {
    repos: config.get('extraRepos', []),
    maxCommits: config.get('maxCommits', 400),
    timeoutMs: config.get('timeoutMs', 60_000),
    networkTimeoutMs: config.get('networkTimeoutMs', 180_000),
  }
}

/** Adapter from VS Code workspace folders to the shared Git engine's registry. */
function workspaceRegistry() {
  return {
    list() {
      return (vscode.workspace.workspaceFolders ?? [])
        .filter((folder) => folder.uri.scheme === 'file')
        .map((folder) => ({
          path: folder.uri.fsPath,
          title: folder.name,
        }))
    },
  }
}

function isChinese() {
  return String(vscode.env.language ?? '').toLowerCase().startsWith('zh')
}

function defaultRepository() {
  const folder = vscode.workspace.workspaceFolders?.find((item) => item.uri.scheme === 'file')
  if (folder) return folder.uri.fsPath
  const configured = readSettings().repos
  return Array.isArray(configured) && typeof configured[0] === 'string' ? configured[0] : undefined
}

/** Inline loader runs before the bundled React/UI code and captures its plugin definition. */
function webviewHtml(webview, context) {
  const template = readFileSync(context.asAbsolutePath('media/webview.html'), 'utf8')
  const nonce = randomBytes(24).toString('base64')
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'),
  )
  return template
    .replaceAll('__CSP_SOURCE__', webview.cspSource)
    .replaceAll('__NONCE__', nonce)
    .replaceAll('__SCRIPT_URI__', String(scriptUri))
    .replaceAll('__LANG__', isChinese() ? 'zh-CN' : 'en')
}

function post(panel, message) {
  try {
    void panel.webview.postMessage(message).then(undefined, () => {})
  } catch {
    // The panel may have been disposed while a Git operation was running.
  }
}

async function handleMessage(panel, message) {
  if (!message || typeof message !== 'object') return
  if (message.type === 'log') {
    output?.appendLine(`webview: ${String(message.text ?? '')}`)
    return
  }
  if (message.type === 'copy') {
    try {
      await vscode.env.clipboard.writeText(String(message.text ?? ''))
    } catch (error) {
      output?.appendLine(`clipboard: ${error instanceof Error ? error.message : String(error)}`)
    }
    return
  }
  if (message.type !== 'git-request') return

  const id = String(message.id ?? '')
  try {
    const data = await gitHost.run(message.payload)
    post(panel, { type: 'git-response', id, ok: true, data })
  } catch (error) {
    const failure = failureOf(error)
    output?.appendLine(`[${message.payload?.op ?? 'unknown'}] ${failure.message}`)
    if (failure.detail) output?.appendLine(`  ${failure.detail}`)
    post(panel, { type: 'git-response', id, ...failure })
  }
}

function setupPanel(panel, context, { reveal = false } = {}) {
  activePanel = panel
  panel.title = isChinese() ? 'Git 管理' : 'Git Manager'
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'git.svg')
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
  }
  panel.webview.html = webviewHtml(panel.webview, context)

  const subscription = panel.webview.onDidReceiveMessage((message) => {
    void handleMessage(panel, message)
  })
  panel.onDidDispose(() => {
    subscription.dispose()
    if (activePanel === panel) activePanel = undefined
  })

  if (reveal) panel.reveal(undefined, false)
}

function openPanel(context) {
  if (activePanel) {
    activePanel.reveal(undefined, false)
    return activePanel
  }
  const panel = vscode.window.createWebviewPanel(
    PANEL_TYPE,
    isChinese() ? 'Git 管理' : 'Git Manager',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    },
  )
  setupPanel(panel, context)
  return panel
}

/** Optional AI integration for VS Code-compatible hosts that expose the LM Tools API. */
function registerLanguageModelTool(context) {
  if (typeof vscode.lm?.registerTool !== 'function') return
  if (typeof vscode.LanguageModelToolResult !== 'function') return
  if (typeof vscode.LanguageModelTextPart !== 'function') return

  try {
    const registration = vscode.lm.registerTool(TOOL_NAME, {
      prepareInvocation(options) {
        const action = String(options?.input?.action ?? 'git')
        return {
          invocationMessage: isChinese() ? `Git 管理：${action}` : `Git Manager: ${action}`,
        }
      },
      async invoke(options) {
        const input = options?.input && typeof options.input === 'object' ? options.input : {}
        const payload = toPayload(input, defaultRepository())
        const data = await gitHost.run(payload)
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(summarize(input.action, data)),
        ])
      },
    })
    context.subscriptions.push(registration)
  } catch (error) {
    output?.appendLine(
      `language model tool not registered: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function activate(context) {
  extensionContext = context
  output = vscode.window.createOutputChannel('Git Manager')
  context.subscriptions.push(output)

  gitHost = createGitHost({
    getConfig: readSettings,
    getWorkspaceRegistry: workspaceRegistry,
    logger: {
      error(message) {
        output.appendLine(message)
      },
      warn(message) {
        output.appendLine(`warning: ${message}`)
      },
    },
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('codebuddyGitManager.open', () => openPanel(context)),
  )

  if (typeof vscode.window.registerWebviewPanelSerializer === 'function') {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(PANEL_TYPE, {
        async deserializeWebviewPanel(panel) {
          setupPanel(panel, context)
        },
      }),
    )
  }

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  status.name = 'Git Manager'
  status.text = '$(git-branch) Git'
  status.tooltip = isChinese() ? '打开 Git 管理' : 'Open Git Manager'
  status.command = 'codebuddyGitManager.open'
  status.show()
  context.subscriptions.push(status)

  registerLanguageModelTool(context)
}

export function deactivate() {
  activePanel = undefined
  gitHost = undefined
  extensionContext = undefined
}
