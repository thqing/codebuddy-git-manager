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

## ⚠️ 先读：本地来源会「绑定绝对路径」

`install_bundle` 对**本地目录或本地 tgz** 会把依赖写进 profile 的清单：

```json
// ~/.dsh/profiles/desktop/package.json
"@local/dsh-git-manager": "link:/Users/you/dsh-plugins/dsh-git-manager"      // 目录方式
"@local/dsh-git-manager": "file:/Users/you/Downloads/xxx-1.0.0.tgz"          // tgz 方式
```

这个路径**之后不能移动、改名或删除**，否则整份清单解析失败——
症状是**以后安装任何插件都会报 ENOENT**，而不只是这个插件。

出问题时的修复办法：把原路径上的目录/文件先恢复回去（哪怕临时），
再用 `install_bundle` 指向新位置即可把依赖改绑过去。

要彻底避免这件事，就用**方式 C（Git 仓库）**或**方式 D（私有 registry）**：它们不绑定本地路径。

---

## 1. 在新电脑上安装

前提：那台机器已经装好 DSH（Desktop），并能打开 Web GUI。四种方式任选。

### 方式 A —— Git 仓库（**跨机器最推荐**）

```bash
git clone <你的仓库地址> ~/dsh-plugins/dsh-git-manager
```

然后在本机 DSH 会话里让 Agent 执行：

> `plugin_manager` → `install_bundle`，target 为 `~/dsh-plugins/dsh-git-manager` 的**绝对路径**

也可以把仓库推到自己的远端后直接按 Git 地址装（连 clone 都不用手动做）：

> `install_bundle`，target 为 `git+ssh://git@your-host/you/dsh-git-manager.git`

不绑定本地路径，卸载/重装都干净。

### 方式 B —— 源码目录（本机日常改代码时最方便）

把 `dsh-git-manager/` 整个目录拷到新电脑（例如 `~/dsh-plugins/dsh-git-manager`），然后：

> `install_bundle`，target 为该**目录的绝对路径**

`link:` 方式：改 `client.js` 后页面自动热加载，改 Host 半边重启生效。
**代价：目录不能移动或删除**（见上面的警告）。

### 方式 C —— 单个 tgz（拷给不方便 git 的机器）

```bash
npm test && npm pack          # 生成 local-dsh-git-manager-1.0.0.tgz
```

把 tgz 放到目标机器的一个**固定目录**（例如 `~/dsh-plugins/dist/`）后：

> `install_bundle`，target 为该 tgz 的**绝对路径**

pnpm 会把 tarball 解包成 profile 自己的副本，所以插件运行不依赖源目录；
但**那个 tgz 本身不能删/不能移动**（见上面的警告）。

### 方式 D —— 私有 npm registry（可选）

去掉 `package.json` 里的 `"private": true`，把包名换成自己的 scope，
`npm publish` 到私有源后：

> `install_bundle`，target 为包名 `@your-scope/dsh-git-manager`

不绑定本地路径。

---

## 2. 安装后自检

| 检查项 | 方法 |
| --- | --- |
| 侧栏图标 | 「全局面板」区出现 Git 图标，点开能看到分支树与提交图 |
| 客户端注册 | `cordis_inspect_query` → platform `client`、provider `Slots`、method `listSubTree`、input `{"root":"sidebar.panellist"}`，occupants 里应有 `git` |
| Host 能力 | 调 `git_manage`（例如 `action: branches`, `repo: <你的仓库>`），能返回分支统计 |
| 引擎单测 | 在插件目录执行 `npm test`（50 个用例：squash / 未跟踪文件 diff / 提交图几何 / 多选交互） |

---

## 3. 修改后的升级流程

```bash
cd dsh-git-manager
npm test                 # 先保证 50 个用例通过
git commit -am "..."     # 源码方式直接生效；tgz/npm 方式需要重新打包发布
```

- **方式 A/B（源码或 link）**：Host 半边改动 → 让 Agent 重新 `install_bundle` 一次 → 重启 DSH；
  `client.js` 改动 → 页面自动热加载，无需重启。
- **方式 C（tgz）/ D（npm）**：`npm pack` 出新包（版本号建议 +1）→ 覆盖固定目录里的旧包（**路径别变**）
  → 让 Agent 再用同一 target 执行 `install_bundle` → 重启 DSH。

> **为什么 Host 半边必须重启**：DSH 每个进程只加载一代 Host 模块，替换已安装的包后需要新的一代。
> 面板启动时会调用 Host 的 `capabilities` 探测当前代次，能力缺失时相关菜单项会置灰并给出说明，不会静默失败。

---

## 4. 卸载

> `plugin_manager` → `remove_bundle`，target 为 `@local/dsh-git-manager`。

卸载后 profile 里对应依赖与 `node_modules/@local/dsh-git-manager` 会被移除，重启 DSH 后侧栏图标消失。

---

## 5. 运行前提与边界

- 系统需要 `git`；面板里所有操作都是 `execFile('git', argv)`，从不经过 shell；
- 客户端通过**同源** `POST /api/dsh-git` 调用 Host，走 DSH `/api` 的 Host/Origin 校验与浏览器会话 Cookie 鉴权，
  不额外开端口、不绕过鉴权；
- 所有写操作按仓库串行化；破坏性操作（丢弃更改 / `reset --hard` / 删除分支 / Squash）都有确认或预校验与恢复提示；
- 需要 DSH 版本提供 `ctx.connection.fetch`（精确 Fetch 路由）与 `sidebar.panellist` / `main` 插槽，
  即本插件开发时的 DSH 0.2.0-rc.2 桌面 / Web 形态。
