# Git Manager for CodeBuddy

一个运行在 **CodeBuddy IDE / VS Code** 里的 IDEA 风格 Git 工具窗口。它是本仓库 DSH 插件的
CodeBuddy 宿主版本，复用同一套 Git 引擎和图形界面：

- 左侧 Local / Remote 分支树，支持按 `/` 折叠的目录层级；
- 中间泳道式提交图，显示 HEAD、分支、标签、作者与时间；
- 下方变更 / 提交详情 / 差异三个页签；
- 暂存、取消暂存、丢弃、提交、修订、Fetch、Pull、Push、Merge、Rebase、Reset、Stash、
  Cherry-pick、Tag 与 Squash；
- “更新项目”支持先 Fetch，再按 Merge / Rebase / Reset 整合上游；
- 所有 Git 参数以 argv 数组传给 `execFile('git', …)`，不经过 shell；同一仓库的写操作串行执行。

## 安装

### 从 VSIX 安装

1. 打开 CodeBuddy IDE 的扩展面板；
2. 点击扩展面板右上角 `…`；
3. 选择 **Install from VSIX / 从 VSIX 安装**；
4. 选择本目录生成的 `codebuddy-git-manager-1.0.0.vsix`；
5. 按提示 Reload Window。

VS Code 也可以使用命令行安装：

```bash
code --install-extension codebuddy-git-manager-1.0.0.vsix
```

运行前提：

- CodeBuddy IDE 的 VS Code API 版本不低于 `1.95.0`；
- 系统 `PATH` 中可使用 `git`。

### 打开面板

安装后有三种入口：

- 左下状态栏的 **`Git`** 按钮；
- 源代码管理视图标题栏的 Git 分支图标；
- 命令面板：**Git Manager: Open**。

面板在编辑器区域打开，适合展示分支树、提交图和差异内容。

## 使用说明

- 仓库来源默认为当前工作区文件夹；也可以在设置 `codebuddyGitManager.extraRepos`
  中添加额外仓库目录。
- 面板内的“添加仓库”支持选择任意带 `.git` 的目录，或在该目录执行 `git init`。
- 分支、标签支持双击检出；右键菜单提供合并、变基、重命名、删除、推送等操作。
- 提交支持 Shift / Ctrl 多选和 Squash；破坏性操作会要求二次确认。
- 复制名称、提交哈希和 diff 通过扩展宿主写入系统剪贴板。

## 配置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `codebuddyGitManager.extraRepos` | `[]` | 工作区之外额外显示的仓库目录 |
| `codebuddyGitManager.maxCommits` | `400` | 提交图最多加载的提交数 |
| `codebuddyGitManager.timeoutMs` | `60000` | 本地 Git 操作超时 |
| `codebuddyGitManager.networkTimeoutMs` | `180000` | Fetch / Pull / Push 超时 |

## 与 DSH 版本的关系

本目录是一个独立的 VS Code 扩展包，不替换仓库根目录的 DSH 插件：

```text
dsh-git-manager/
├── git.js                 # 两个宿主共享的 Git 引擎
├── client.js              # 两个宿主共享的 React UI
├── index.js               # 原 DSH Host：HTTP 路由 + git_manage
└── codebuddy/
    ├── src/extension.js   # VS Code 扩展宿主：命令、状态栏、Webview、剪贴板
    ├── src/host.js        # 共享引擎的串行化与错误包络
    ├── src/webview/       # Webview RPC 与 React 挂载
    ├── media/webview.html # CSP、CodeBuddy 主题变量映射
    └── dist/              # 构建产物（不提交）
```

共享 UI 只增加了两个可选钩子：

- `__DSH_GIT_CALL__`：CodeBuddy Webview 用 `postMessage` RPC；DSH 继续使用原来的 Fetch 路由；
- `__DSH_GIT_COPY__`：CodeBuddy 由扩展宿主写剪贴板；DSH 继续使用浏览器 Clipboard API。

如果 CodeBuddy/VS Code 宿主实现了 VS Code Language Model Tools API，扩展还会注册
`gitManager` 工具，让模型复用同一套 Git 操作。该能力是否出现在 CodeBuddy 的 Agent
工具列表中，取决于宿主对 LM Tools API 的支持程度；图形面板本身不依赖它。

## 开发与打包

```bash
cd codebuddy

npm install
npm test                  # 构建 + 18 项宿主/RPC/Agent/扩展冒烟测试
npm run preview -- --repo /path/to/repository
npm run package:vsix      # dist + VSIX
```

`npm run preview` 只监听 `127.0.0.1`，使用真实 Git 引擎模拟 `acquireVsCodeApi`，
用于在没有启动 IDE 的情况下检查界面。预览服务不进入 VSIX。

产物：

```text
dist/extension.cjs
dist/webview.js
codebuddy-git-manager-1.0.0.vsix
```

## 测试覆盖

- 原仓库 57 项 Git 引擎、DSH Host 与共享 UI 测试；
- CodeBuddy Host 4 项：工作区发现、Snapshot、错误包络、写操作串行化；
- Webview RPC 5 项：成功、失败、未知响应、超时、销毁；
- Agent 参数映射 4 项；
- 扩展宿主冒烟 5 项：激活、命令注册、CSP HTML、RPC、剪贴板、面板复用。

## 安全边界

- 不启动本地 HTTP 服务；Webview 与扩展宿主只通过 VS Code 的 `postMessage` 通信；
- 仓库路径由共享引擎执行 `realpath` + `git rev-parse` 校验；
- 引用名、远程名和路径拒绝以 `-` 开头的参数；
- 丢弃、硬重置、删除分支、Squash 等破坏性操作有确认步骤；
- 扩展没有第三方运行时依赖，React 已打包进 `dist/webview.js`。
