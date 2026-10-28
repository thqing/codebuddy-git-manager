# CodeBuddy Git Manager

一个运行在 **CodeBuddy IDE / VS Code** 中的 IDEA 风格 Git 图形化扩展：

- 左侧 Local / Remote 分支树，支持目录层级、上游与 ahead / behind；
- 中间泳道式提交图，支持合并提交、多泳道和 refs 徽标；
- 下方变更 / 提交详情 / 差异三个页签；
- 覆盖暂存、提交、修订、Fetch、Pull、Push、Merge、Rebase、Reset、Stash、Tag、Squash 与编辑提交信息。

扩展使用系统 `git`，不依赖额外的 Git 服务；所有命令以 argv 数组执行，不经过 shell。

## 功能

### 分支树

- 分支名按 `/` 拆成可折叠目录，例如 `feature/login` 显示为 `feature` ▸ `login`；
- Local 显示当前分支、上游和 `↑ahead / ↓behind`；
- Remote 按 remote 分组，Tags 支持目录层级；
- Stash、Remotes 独立分组，双击 Stash 可直接弹出；
- 当前分支用绿色加粗突出显示。

### 提交图

- 按父子关系绘制泳道图，支持合并提交；
- 每行显示短 hash、HEAD / 分支 / 标签、提交信息、作者与时间；
- 搜索框按提交信息、作者或 hash 过滤；
- “全部分支”开关切换 `git log --all`。

### 变更与差异

- 已暂存、未暂存、未跟踪三组文件；
- 支持批量暂存、取消暂存、丢弃文件和查看差异；
- 未跟踪文件也能显示“新文件”diff；
- 提交信息支持 `Cmd/Ctrl+Enter` 快速提交和 `--amend`。

### 图形化操作

| 位置 | 操作 |
| --- | --- |
| 工具栏 | 刷新、获取、更新项目、推送、新建分支、拉取、合并、变基、Stash、提交身份、远程管理 |
| 本地分支右键 | 检出、新建分支、合并、变基、推送、重命名、创建标签、删除、复制名称 |
| 远程分支右键 | 检出、新建本地分支、合并、变基、删除远程分支、复制名称 |
| 提交右键 | 检出、创建分支/标签、Cherry-pick、Revert、编辑提交信息（仅未推送提交）、Reset、复制 hash/信息 |
| 多选提交右键 | Squash Commits、复制多个 hash |
| 文件右键 | 暂存、取消暂存、丢弃、查看差异 |

### 更新项目

“更新项目”相当于 IDEA 的 Update Project：

1. 先执行 `git fetch`；
2. 计算当前分支的 ahead / behind；
3. 按 Merge、Rebase 或 Reset 整合上游。

已经是最新时不会创建空合并提交。

### 编辑提交信息

相当于 IDEA 的 Edit Commit Message，只改写**未推送的本地提交**：

- 对话框预填完整提交信息（标题 + 正文），改完 `Cmd/Ctrl+Enter` 或点“保存”；
- HEAD 走 `git commit --amend --only`，已暂存的改动不会被卷进这次提交；更早的提交走交互式变基，
  区间含合并提交时保留合并结构，根提交走 `--root`；
- 工作区或索引有未提交改动时先 stash、改写后 `stash pop --index`，已暂存状态不丢；
- 改写前后校验 `HEAD^{tree}` 不变，失败自动中止变基并恢复 stash；
- 已推送的提交在菜单中禁用并说明原因；空信息、信息无变化、存在未完成的变基/合并/摘取都会被拒绝。

### Squash Commits

- Shift 点击扩选相邻提交，Cmd/Ctrl 点击增减选择；
- 压缩前校验提交连续、无合并提交、在当前 HEAD 历史中且工作区干净；
- 支持编辑压缩后的提交信息；
- 显示净变更文件数和增删行数；
- 失败时给出原 HEAD 和恢复命令。

## 安装

### 从 VSIX 安装

先构建安装包：

```bash
cd codebuddy
npm install
npm run package:vsix
```

产物为 `codebuddy/codebuddy-git-manager-1.0.0.vsix`。然后：

1. 打开 CodeBuddy IDE / VS Code 扩展面板；
2. 点击右上角 `…`；
3. 选择 **Install from VSIX / 从 VSIX 安装**；
4. 选择 `codebuddy/codebuddy-git-manager-1.0.0.vsix`；
5. 执行 **Developer: Reload Window / 开发人员: 重新加载窗口**。

> 必须重载窗口：已打开的 Git 管理面板不会自动换用新的前端 bundle。

命令行安装：

```bash
# VS Code
code --install-extension codebuddy/codebuddy-git-manager-1.0.0.vsix

# macOS 上的 CodeBuddy CN（使用 IDE 自带 CLI）
"/Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code" \
  --install-extension "$PWD/codebuddy/codebuddy-git-manager-1.0.0.vsix"
```

### 覆盖安装 / 升级

扩展版本号未变（同为 `1.0.0`）时，直接安装可能提示“已安装”。两种做法任选：

```bash
# 1) 强制覆盖
code --install-extension codebuddy/codebuddy-git-manager-1.0.0.vsix --force

# 2) 先卸载再安装
code --uninstall-extension thqing.codebuddy-git-manager
code --install-extension codebuddy/codebuddy-git-manager-1.0.0.vsix
```

GUI 对应做法：扩展面板卸载 **CodeBuddy Git Manager** → Reload Window → 再从 VSIX 安装。

安装或覆盖后都要再执行一次 **Reload Window**。

### 运行前提

- CodeBuddy IDE / VS Code 的 API 版本不低于 `1.95.0`；
- 系统 `PATH` 中可以使用 `git`。

### 验证安装

- 扩展面板中能看到 **CodeBuddy Git Manager 1.0.0**（发布者 `thqing`）；
- 状态栏出现 **Git** 按钮，命令面板能搜到 **Git 管理: 打开**；
- 提交图右键未推送的提交能看到 **编辑提交信息…**，已推送的提交为灰色；
- 异常时查看输出面板的 **Git Manager** 通道。

### 打开面板

安装后有三种入口：

- 左下状态栏的 **Git** 按钮；
- 源代码管理视图标题栏的 Git 分支图标；
- 命令面板 **Git 管理: 打开**。

面板在编辑器区域打开，适合展示分支树、提交图和差异。

## 配置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `codebuddyGitManager.extraRepos` | `[]` | 工作区之外额外显示的仓库目录 |
| `codebuddyGitManager.maxCommits` | `400` | 提交图最多加载的提交数 |
| `codebuddyGitManager.timeoutMs` | `60000` | 本地 Git 操作超时 |
| `codebuddyGitManager.networkTimeoutMs` | `180000` | Fetch / Pull / Push 超时 |

仓库默认来自当前工作区；也可以在面板内添加带 `.git` 的目录，或在空目录执行 `git init`。

## Agent 工具

如果宿主实现 VS Code Language Model Tools API，扩展会注册 `gitManager` 工具。它和图形面板共用同一套 Git 引擎，支持 `status`、`branches`、`log`、`diff`、`stage`、`commit_staged`、`checkout`、`merge`、`rebase`、`reset`、`squash`、`update_project`、`reword_commit` 等操作。

该工具是否出现在 CodeBuddy Agent 的工具列表中，取决于宿主对 Language Model Tools API 的支持；图形面板本身不依赖它。

## 开发

要求：

- Node.js 20+
- npm
- 系统 Git

```bash
cd codebuddy

npm install
npm test
npm run preview -- --repo /path/to/repository
npm run build
npm run package:vsix
```

根目录也提供快捷命令：

```bash
npm run test:codebuddy
npm run build:codebuddy
npm run package:codebuddy
```

`npm run preview` 只监听 `127.0.0.1`，使用真实 Git 引擎模拟 `acquireVsCodeApi`，可以在不启动 IDE 的情况下检查 Webview。

构建产物：

```text
codebuddy/dist/extension.cjs
codebuddy/dist/webview.js
codebuddy/codebuddy-git-manager-1.0.0.vsix
```

## 项目结构

```text
codebuddy-git-manager/
├── codebuddy/
│   ├── src/extension.js       # 扩展宿主：命令、状态栏、WebviewPanel、剪贴板
│   ├── src/host.js            # Git 引擎调度、写操作串行化、错误包络
│   ├── src/webview/           # Webview RPC 与 React 挂载
│   ├── media/webview.html     # CSP 与 CodeBuddy/VS Code 主题变量
│   ├── test/                  # 宿主、RPC、Agent、扩展冒烟测试
│   ├── scripts/               # 构建与本地预览
│   └── package.json           # VSIX 清单
├── git.js                     # 共享 Git 引擎
├── client.js                  # 共享 React Git UI
├── test/                      # 引擎与 UI 回归测试
└── package.json               # 根目录开发脚本
```

## 测试

```bash
# 扩展宿主、RPC、Agent 与 Webview 构建
cd codebuddy && npm test

# 共享 Git 引擎与 UI 回归测试
npm test
```

覆盖范围：

- 扩展激活、命令注册、CSP HTML、面板复用；
- Webview RPC 成功、失败、超时和销毁；
- 工作区发现、Snapshot、Git 错误包络；
- 同一仓库写操作串行化；
- Squash、编辑提交信息（HEAD/老提交/根提交/合并提交）、未跟踪文件 diff、提交图几何和分支树交互。

## 安全设计

- Git 参数以 argv 数组传给 `execFile`，不经过 shell；
- 仓库路径通过 `realpath` 和 `git rev-parse` 校验；
- 拒绝以 `-` 开头的引用名、远程名和路径参数；
- 丢弃、硬重置、删除分支和 Squash 等破坏性操作需要确认；
- Webview 与扩展宿主只通过 `postMessage` 通信，不启动本地 HTTP 服务；
- `node_modules`、`dist` 和 `.vsix` 不提交到仓库。

## License

当前仓库未声明开源许可证（包清单为 `UNLICENSED`）。如需公开分发，请先补充 `LICENSE` 文件。
