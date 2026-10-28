# Git Manager for CodeBuddy

CodeBuddy IDE / VS Code 的 IDEA 风格 Git 工具窗口：分支树、提交图、差异、变更区和图形化 Git 操作。

## 安装

1. 在扩展面板右上角点击 `…`；
2. 选择 **Install from VSIX / 从 VSIX 安装**；
3. 选择 `codebuddy-git-manager-1.0.0.vsix`；
4. 执行 **Developer: Reload Window / 开发人员: 重新加载窗口**。

命令行安装：

```bash
# VS Code
code --install-extension codebuddy-git-manager-1.0.0.vsix

# macOS 上的 CodeBuddy CN（使用 IDE 自带 CLI）
"/Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code" \
  --install-extension "$PWD/codebuddy-git-manager-1.0.0.vsix"
```

覆盖安装（版本号同为 `1.0.0` 时直接安装可能提示“已安装”）：

```bash
code --install-extension codebuddy-git-manager-1.0.0.vsix --force

# 或先卸载再安装
code --uninstall-extension thqing.codebuddy-git-manager
code --install-extension codebuddy-git-manager-1.0.0.vsix
```

GUI 对应做法：卸载 **CodeBuddy Git Manager** → Reload Window → 再从 VSIX 安装。安装或覆盖后都必须重载窗口，已打开的面板不会自动换用新 bundle。

运行前提：

- 宿主的 VS Code API 版本不低于 `1.95.0`；
- 系统 `PATH` 中可以使用 `git`。

## 打开

- 左下状态栏 **Git**；
- 源代码管理视图标题栏的 Git 分支图标；
- 命令面板 **Git 管理: 打开**。

## 功能

- 分支名按 `/` 折叠为目录，当前分支显示上游和 ahead / behind；
- Local、Remote、Tags、Stash、Remotes 分组；
- 提交图支持合并提交、多泳道、refs 徽标、搜索和全部分支；
- 已暂存 / 未暂存 / 未跟踪文件，支持暂存、取消暂存、丢弃和 diff；
- 提交、修订、Fetch、Pull、Push、Merge、Rebase、Reset、Stash、Cherry-pick、Tag；
- 更新项目：Fetch 后按 Merge / Rebase / Reset 整合上游；
- 编辑提交信息：只改写未推送的本地提交，预填标题与正文，保留暂存状态与合并结构；
- Squash：多选相邻提交，预校验后编辑提交信息并显示净变更；
- 分支、提交和文件右键菜单。

## 配置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `codebuddyGitManager.extraRepos` | `[]` | 工作区之外额外显示的仓库目录 |
| `codebuddyGitManager.maxCommits` | `400` | 提交图最多加载的提交数 |
| `codebuddyGitManager.timeoutMs` | `60000` | 本地 Git 操作超时 |
| `codebuddyGitManager.networkTimeoutMs` | `180000` | Fetch / Pull / Push 超时 |

## Agent 工具

宿主支持 VS Code Language Model Tools API 时，扩展会注册 `gitManager` 工具，与图形面板共用同一套 Git 引擎。

## 开发

```bash
npm install
npm test
npm run preview -- --repo /path/to/repository
npm run build
npm run package:vsix
```

`npm run preview` 只监听 `127.0.0.1`，用于在浏览器中检查 Webview。

## 目录

```text
codebuddy/
├── src/extension.js       # 扩展宿主
├── src/host.js            # Git 调度与错误包络
├── src/webview/           # RPC 与 React 挂载
├── media/webview.html     # CSP 与主题映射
├── test/                  # 宿主、RPC、Agent、扩展测试
├── scripts/               # 构建与预览
└── package.json           # VSIX 清单
```

共享 Git 引擎与 UI 位于仓库根目录的 `git.js` 和 `client.js`。

## 安全

- Git 参数以 argv 数组执行，不经过 shell；
- 仓库路径经过 `realpath` 和 `git rev-parse` 校验；
- 破坏性操作需要二次确认；
- Webview 与扩展宿主只通过 `postMessage` 通信，不启动 HTTP 服务。

## License

包清单使用 `UNLICENSED`。公开分发前请补充 `LICENSE`。
