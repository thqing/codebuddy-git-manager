# 安装 / 迁移 / 升级

这是一个 **DSH（DeepSeek Harness）插件 bundle**：`@local/dsh-git-manager`。
它不依赖任何 npm 包（只用 Node 内置模块 + DSH 运行时提供的能力），唯一的外部前提是系统里有 `git`。

---

## 0. 目录内容

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch`（Host 行）+ `dsh.client`（浏览器半边） |
| `cordis.patch.yml` | 注入 Host 插件行（`repos` / `maxCommits` / `timeoutMs` / `networkTimeoutMs` 可配） |
| `index.js` | Host 半边：注册 `POST /api/dsh-git` 精确路由 + `git_manage` 工具 |
| `git.js` | 纯 Git 引擎（校验 → `execFile('git', argv)` → JSON），可脱离 DSH 单独测试 |
| `client.js` | 浏览器半边：侧栏图标 + `git` 主面板（分支树 / 提交图 / 差异 / 变更 / 多选 / Squash） |
| `icon.svg` `locale/` | 插件卡片图标与标题文案 |
| `test/` | 50 个用例，`npm test` 即可跑，**不需要 DSH** |
| `docs/` | 提交图渲染预览图 |

---

## 1. 在新电脑上安装

前提：那台机器已经装好 DSH（Desktop），并能打开 Web GUI。

### 方式 A —— 单个 tgz 文件（推荐：不依赖仓库、不依赖网络）

1. 把 `dist/local-dsh-git-manager-1.0.0.tgz` 拷到新电脑任意目录，例如 `~/Downloads/`；
2. 打开 DSH，在新会话里对 Agent 说：

   > 安装本地插件 bundle：用 `plugin_manager` 的 `install_bundle`，
   > target 为 `/Users/<你>/Downloads/local-dsh-git-manager-1.0.0.tgz`

3. 看到 `application: applied` 即成功；若提示 `restart-required`（替换已有版本时），**退出并重开 DSH**；
4. 重启后侧边栏「全局面板」区会出现 **Git** 图标。

> 为什么推荐 tgz：pnpm 会把 tarball 解包成 profile 自己的副本
> （`~/.dsh/profiles/desktop/node_modules/@local/dsh-git-manager/`），
> 因此**源目录删掉、换电脑、换路径都不会影响已安装的插件**。

### 方式 B —— 直接指向源码目录

把整个 `dsh-git-manager/` 拷到新电脑，然后：

> `plugin_manager install_bundle`，target 为该**目录的绝对路径**。

这种方式是 `link:`（软链）：好处是改 `client.js` 后页面会自动热加载；代价是**该目录不能删、不能移动**。

### 方式 C —— 从 Git 仓库安装

```bash
git clone <你的仓库地址> dsh-git-manager
```

然后按「方式 B」安装该目录；或把仓库推到自己的远端（GitHub / GitLab / 内网 Gitea）后直接：

> `plugin_manager install_bundle`，target 为 `git+ssh://git@your-host/you/dsh-git-manager.git`

### 方式 D —— 私有 npm registry（可选）

先去掉 `package.json` 里的 `"private": true`，把包名改成自己的 scope（例如 `@your-scope/dsh-git-manager`），
`npm publish` 到私有源后：

> `plugin_manager install_bundle`，target 为包名 `@your-scope/dsh-git-manager`

---

## 2. 安装后自检

| 检查项 | 方法 |
| --- | --- |
| 侧栏图标 | 「全局面板」区出现 Git 图标，点开能看到分支树与提交图 |
| 客户端注册 | 让 Agent 执行 `cordis_inspect_query` → platform `client`、provider `Slots`、method `listSubTree`、input `{"root":"sidebar.panellist"}`，occupants 里应有 `git` |
| Host 能力 | 让 Agent 调 `git_manage`（例如 `action: branches`, `repo: <你的仓库>`），能返回分支统计 |
| 引擎单测 | 在插件目录执行 `npm test`（50 个用例，含 squash / 未跟踪文件 diff / 提交图几何 / 多选交互） |

---

## 3. 修改后的升级流程

```bash
cd dsh-git-manager
npm test                                      # 先保证 50 个用例通过
npm pack                                      # 生成 local-dsh-git-manager-1.0.0.tgz
mv local-dsh-git-manager-1.0.0.tgz ../dist/   # 覆盖旧包
```

然后让 Agent 用新的 tgz 再执行一次 `install_bundle`，并**重启 DSH**。

> **为什么必须重启**：DSH 每个进程只加载一代 Host 模块，替换已安装的插件包后
> Host 半边（`index.js` / `git.js`）要重启才生效。只改 `client.js`（浏览器半边）时页面会自动热加载，无需重启。
> 面板启动时会调用 Host 的 `capabilities` 探测当前代次，能力缺失时相关菜单项会置灰并给出说明，不会静默失败。

---

## 4. 卸载

> 对 Agent 说：`plugin_manager remove_bundle`，target 为 `@local/dsh-git-manager`。

卸载后 `~/.dsh/profiles/desktop/node_modules/@local/dsh-git-manager/` 会被移除，DSH 重启后侧栏图标消失。

---

## 5. 运行前提与边界

- 系统需要 `git`；面板里所有操作都是 `execFile('git', argv)`，从不经过 shell；
- 客户端通过**同源** `POST /api/dsh-git` 调用 Host，走 DSH `/api` 的 Host/Origin 校验与浏览器会话 Cookie 鉴权，
  不额外开端口、不绕过鉴权；
- 所有写操作按仓库串行化；破坏性操作（丢弃更改 / `reset --hard` / 删除分支 / Squash）都有确认或预校验与恢复提示；
- 需要 DSH 版本提供 `ctx.connection.fetch`（精确 Fetch 路由）与 `sidebar.panellist` / `main` 插槽，
  即本插件开发时的 DSH 0.2.0-rc.2 桌面 / Web 形态。
