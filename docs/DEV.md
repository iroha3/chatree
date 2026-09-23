# Chatree 开发文档

> 面向**人**和 **AI Agent**。动手前先读完「绝对不能改的东西」和「交互约定」两节。
>
> 一句话：Chatree 是一个**本地优先**的树状 LLM 对话工作台（React + React Flow +
> Dexie/IndexedDB），可以打包成桌面版（Pake/Tauri）。所有数据只存在浏览器里，零后端。

---

## 0. 工具链：只用 bun

**本项目全程用 [bun](https://bun.sh)，不用 node/npm/pnpm/yarn。**

```bash
bun install            # 装依赖（锁文件是 bun.lock，已提交）
bun run dev            # 起开发服务器 http://127.0.0.1:5175
bun run build          # 生产构建到 dist/
bun run lint           # ESLint
bun test:edge          # 纯逻辑回归（不需要浏览器）
bun test:smoke         # 端到端回归（需要 Edge + dev server，见 §6）
bun test:ux            # 节点交互回归（同上）
```

- ❌ 不要新增 `package-lock.json`（npm 锁文件已删除，双锁文件会漂移）。
- ❌ 脚本、命令、CI 一律 `bun` / `bunx`，不要写 `node` / `npx` / `npm`。
- ✅ `.mjs` 脚本用 bun 直接跑；`node:` 内置模块和原生 `WebSocket`/`fetch` 都支持。

---

## 1. 绝对不能改的东西（数据契约）

改名、重构、翻译随便做，但**下面这些字符串是用户数据的地址，改了就等于把用户数据弄丢**：

| 东西 | 值 | 位置 |
|---|---|---|
| IndexedDB 数据库名 | `TreeChatDatabase` | `src/db/db.ts` |
| 导出的 JSON 格式标识 | `treeai-sessions` | `src/utils/sessionTransfer.ts` |
| localStorage key | `treeai-lang` / `treeai-theme` / `treeai-viewports` | 各 store |
| 桌面版 identifier | `com.chatree.desktop` | `pake.config.json` |

> `treeai-*` 这套前缀看着像历史遗留（早于改名 Chatree），但**不能顺手"统一"成 `chatree-`**：
> 改了老用户的语言/主题/视口偏好会丢。桌面版的 `identifier` 同理，改了 IndexedDB 的
> origin 就变了，等于用户数据清零。

---

## 2. 架构与目录

```
src/
├── components/
│   ├── ChatFlow.tsx          # 画布总编排：节点构建、流式请求、增删改、撤销
│   ├── Sidebar.tsx           # 会话列表 / 文件夹 / 星标 / 搜索
│   ├── SettingsModal.tsx     # 设置中心（模型 / 数据 / 外观 / 关于）
│   ├── ConfirmDialog.tsx     # 应用内确认框（替代 window.confirm）
│   ├── CopyButton.tsx        # 统一的复制按钮（点完变对号）
│   ├── Notification.tsx      # Toast 容器（z-[300]）
│   ├── nodes/ChatNode.tsx    # 对话节点卡片
│   ├── nodes/SystemNode.tsx  # 系统提示词节点
│   └── nodes/NodeReadOverlay.tsx  # 双击放大的只读阅读浮层（portal 到 body）
├── stores/                   # zustand：sessionStore / modelStore / themeStore / ...
├── db/db.ts                  # Dexie schema
├── services/apiService.ts    # OpenAI 兼容的流式请求
├── utils/                    # id / sessionTitle / sessionTransfer / notification
└── i18n/index.ts             # 极简 i18n（中文原文当 key）

scripts/                      # 构建/打包：图标、Pake、产物收集（见 §8）
tests/                        # 回归脚本（见 §6）
docs/                         # 本文件 + ROADMAP
public/                       # hljs/katex 的本地 shim（离线用，见 §5）
```

---

## 3. 交互约定（已定，别擅自改回去）

这些都是踩过坑之后定下来的。改之前先问，或先在本节记录理由。

### 3.1 删除节点
- **只有节点上的垃圾桶按钮能删节点。** React Flow 的 `deleteKeyCode` 已设为 `null`：
  Backspace 删除是"画板"惯例，不适用于"递归删子树 + 确认 + 撤销"，而且它只改 React Flow
  的本地 nodes、不碰 store，会绕过确认/撤销，导致"删掉的节点又跳出来"。
- 删除流程：应用内 `ConfirmDialog` 确认 → `abort()` 在飞的请求 → 删子树 → 8s 内可「撤销」。
- `sessionStore.updateNodeInSession` 是**只 map、不 append**：迟到的流式回调不能复活已删节点。

### 3.2 思考链（reasoning）
- **历史节点默认折叠。**
- 流式期间自动接管：**思考中自动展开**（实时看它在想什么）→ **思考结束安静折叠**
  （正文第一个分片到达，或整个流结束）。
- 用户手动点过折叠开关后，就不再自动干预。
- 实现见 `ChatNode.tsx` 的 `reasoningTouchedRef` + effect。判断"思考结束"用的是
  `streamingReasoning 还在 && 正文还没开始`，不能用 `isLiveReasoning`（它在正文阶段仍为真）。

### 3.3 运行入口（发送 / 停止 / 重新生成）
- **右下角只有一颗按钮，走完整个生命周期**（ChatGPT 式）：
  | 状态 | 图标 | 行为 |
  |---|---|---|
  | 编辑中 | `Send` | `onResubmit`：用当前文字**就地**重答 |
  | 流式中 | `Square` | `onStop`：中止并保存已生成内容 |
  | 其他 | `RefreshCcw` | `onRetry`：**另起一个兄弟分支**，保留当前回答 |
- 这颗按钮**恒可见**（不靠悬停）；复制 / 放大这类次要动作仍然只在悬停时出现。
- ❌ 输入框里**不再**自带发送键。曾经它在编辑态存在、一离开编辑态就消失，
  用户找不到发送入口（“离开编辑模式发送按钮就没了”）。
- ❌ 不要再生一个停止按钮塞进“AI 正在思考…”那一行（曾经有过，被用户点名“这是啥玩意”）。
- ❌ 不要用 `bg-white/90` 这类半透明底色 —— 它绕过 `html.dark .bg-white` 覆盖，
  夜里会变成一块亮白药丸。
- 统计行加了 `pr-14` 给这颗按钮让位，否则最后几项会被压住。

### 3.4 输入框（编辑态）
- 用户的提问有两种皮：**只读**（默认，有消息时）和**输入框**（点击消息进入）。
- 退出编辑态的路子：**点发送**、**点节点外面**（画布空白 / 别的节点 / 侧边栏）、
  **Esc**。
  - 曾经只有「点发送」能退出，导致死胡同：改了字又不想重发，就永远停在输入框样式里。
  - 「点外面」的判定是 `nodeRef` 之外（capture 阶段监听 `mousedown`）——
    节点**内部**的控件（模型下拉、温度滑块、思考链开关…）不算外面，不会打断正在编辑的人。
  - 草稿每次击键都已经同步进 store，退出只是收皮，**不回滚**。
- Ctrl/Cmd+Enter 也能发送。

### 3.5 复制
- 一律用 `CopyButton`：点击后**立即**变对号（1.5s）。
- 内部优先用 `document.execCommand('copy')`：桌面端（WebView2）里
  `navigator.clipboard.writeText` 会弹**原生剪贴板授权框**，而且异步等待会让反馈迟迟不出来。

### 3.6 弹窗 / 通知
- **禁止 `window.confirm` / `alert` / `prompt`。** 用 `src/stores/confirmStore.ts` +
  `ConfirmDialog`。
- Toast 容器是 `z-[300]`，必须高于阅读浮层和确认框（`z-[100]`），否则复制反馈被盖住。

### 3.7 i18n
- 中文原文就是 key；词典只维护 zh → en 一张表，**漏翻会原样回退中文**，所以可以增量补。

### 3.8 界面宽度
- `.node-content` 的宽度（`src/index.css`）必须和 `ChatFlow.tsx` 的 `NODE_WIDTH` 一致
  （当前 **548**）。两处不同步会出现节点与连线错位。

### 3.9 排版
- 回答正文由 `md-editor-rt` 渲染，所有字号/间距微调集中在 `src/index.css` 的
  `.md-preview` 段（卡片和阅读浮窗**共用**这个类）：卡片正文 19px、段落/列表间距已收紧；
  阅读浮窗加 `.reader` 类降到 16px。改这些值顺手看一眼 `bun test:ux` 里的排版断言。
- **代码块不能上宽下窄、中间不能有缝**：带红绿灯的标题条 `.md-editor-code-head`
  是整块宽度，而 Tailwind prose 会给外层 `<pre>` 塞一整圈内边距（约 12px），
  两块底色既不等宽、上下又错开，中间露一条白缝
  （用户报过「红绿灯那一条比代码那一条宽」「中间有间隔」）。所以
  `.md-preview .md-editor-code pre` 的 padding 被整个强制归零 —— 文字缩进由
  内层 `<pre><code>` 自己负责，行号的 `padding-left: 3.5em` 不受影响。
  回归断言在 `node-ux-check.mjs` 里量两者宽度相等、且上下无缝隙。

### 3.10 用量数字
- 箭头方向：**↑ = 输入（prompt），↓ = 输出（completion）**。
- **每个数字都要带单位**（`tok` / `字` / `%` / `tok/s`），不能只给最后一个带 ——
  用户问过「思考是多少字还是 token」。当前行形如：
  `63 字 · ~22 tok/s · 缓存 87% · ↑ 11 tok · ↓ 22 tok · 思考 33 tok`。

---

## 4. React Flow 的坑（血泪）

1. **节点入场动画只能动 `opacity`，绝不能动 `transform`。**
   translate/scale 会污染 handle 的测量基准，动画期间连线终点会飘，结束后才"啪"地接上。
2. **重建 nodes 数组时必须带上测量出来的 `width/height`。**
   `ChatFlow.tsx` 用 `flowNodesRef` 保存上一次渲染的节点，`buildFlowNode(..., previous)`
   从它取 `previous`；否则 `getNodeData().isValid` 为 false，边会消失/截断。
   回归见 `tests/edge-contract-check.mjs`。
3. **交互控件要加 `nodrag nopan`**（range / select / textarea / 按钮 / 浮层），
   否则触摸或拖动会带动画布。
4. 尺寸变化后调 `updateNodeInternals(id)` 重新测量。
5. `Ctrl+滚轮` 留给画布缩放；节点内部滚动要 `stopPropagation`。

---

## 5. 离线优先 / 安全

- **零第三方 CDN 请求**：`highlight.js` / `katex` 走 `public/*-shim.js` 本地加载。
  不要引入 CDN 链接，也不要为了小功能随意加依赖。
- **Markdown 必须关掉原始 HTML**：`markdownItConfig: md => md.set({ html: false })`。
  历史漏洞：渲染出的 HTML 能执行脚本，而 API Key 就在同源 IndexedDB 里 —— 真实可利用。
- 备份/导出**绝不能包含 API Key**。

---

## 6. 回归测试

三个脚本都在 `tests/`（不要放回 `scripts/` —— 那是构建/打包用的）。

| 脚本 | 依赖 | 覆盖 |
|---|---|---|
| `bun test:edge` | 无 | 复制 React Flow 的 `createNodeInternals/applyNodeChanges` 语义，断言"掉边"的两种取法 |
| `bun test:smoke` | Edge:9222 + dev:5175 | 主流程端到端（建会话/建模型/发消息/导入导出…） |
| `bun test:ux` | Edge:9222 + dev:5175 | 28 项节点交互：去重、思考折叠、阅读浮层、星标三态、删除确认+撤销、排版、代码块等宽、编辑态进出、运行按钮… |

跑端到端前需要：

```bash
# 1) 起 dev server（5175）
bun run dev
# 2) 起 headless Edge 并开 CDP
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chatree-edge about:blank
# 3) 跑脚本
bun test:ux
```

脚本里用 `Input.dispatchMouseEvent` 真实移动鼠标来测 `:hover`（**别只查 className** ——
曾因此漏掉一个 CSS 优先级 bug：`.group:hover .x`(0,3,0) 盖过 `.x:hover`(0,2,0)）。

---

## 7. 版本号：只有一个来源

`package.json` 的 `version` 是**唯一**来源，喂给三处：

1. 前端：`vite.config.ts` 用 `define` 注入 `__APP_VERSION__`（页面"关于"用）
2. 桌面版：`scripts/pake.mjs` 读出来传给 `pake --app-version`
3. 发版：CI 用它打 git tag `v$VERSION`

❌ 不要再在任何地方手写版本号。

---

## 8. 桌面版（Pake）

**仓库里不出现 Rust**，只有 `pake.config.json` + `scripts/pake.mjs`。

```bash
bun run desktop:build        # 完整打包（当前平台）
bun run desktop:build:fast   # 本地快速（只出可执行文件，不出安装包）
```

关键坑：

1. **`enableDragDrop` 必须是 `false`。**
   Pake 的 `enableDragDrop: true` 打开的是 **Tauri 原生文件拖放处理器**，它会拦截并吃掉
   WebView 的 HTML5 拖放 —— 表现就是"模型排序 / 会话拖进文件夹没反应"。设成 `false`
   （= `disable_drag_drop_handler()`）才恢复网页内拖拽。我们不需要原生文件拖入。
2. **图标必须按平台给对应格式**，否则 Pake **只警告、然后回退成它自带的默认图标**：
   - Windows → `build/icon.ico`（256×256）
   - macOS → `build/icon.icns`
   - Linux → `build/icon-512.png`（正好 512）
   `scripts/pake.mjs` 已按 `process.platform` 选好。
   `bun run icons` 从 `public/favicon.svg` 生成三件套（一次性步骤，产物已提交）。
3. **从 Git Bash 构建时 MSVC 的 `link.exe` 会被 GNU 的 `link.exe` 顶掉**，
   报 `link: extra operand`。把 MSVC 的 bin 目录放到 PATH 最前：

   ```bash
   export PATH="/c/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/<版本>/bin/Hostx64/x64:$PATH"
   bun run desktop:build
   ```

4. **桌面版是独立的 origin**（`http://tauri.localhost`），和浏览器的
   `http://127.0.0.1:5175` **不共享 IndexedDB**。所以「浏览器 → 桌面」需要
   「导出 JSON → 重填 API Key → 导入」。但**桌面版本之间**升级不受影响（identifier 不变）。

### 8.1 发布流水线（`.github/workflows/release.yml`）

**发版是手动动作，不是提交的副产品：**

```bash
# 1) 先改 package.json 的 version（tag 名就是 v<version>）
# 2) 推上去（只跑 CI，30 秒）
# 3) 想要发布时，再显式点一下：
gh workflow run release.yml -R iroha3/chatree
```

> ❗ **`release.yml` 绝对不能挂回 `on: push`。** 第一版就是这么写的，结果每次提交
> 都自动跑一遍全平台打包（四个 runner、每个 5–10 分钟）—— 用户原话：
> 「构建成本巨高，怎么又不要钱随手构建啊」。改代码和发版必须分开。

幂等：tag `v<version>` 已存在就直接跳过，重跑不会重复发版。`concurrency.group` 固定成
`release`，两次手动触发不会打架。

矩阵（公开仓库的 runner 不计费，但**时间**才是真正的成本）：

| runner | 产物 |
|---|---|
| `windows-latest` | `.msi` + 便携 `Chatree.exe` |
| `macos-14` + `--multi-arch` | **通用包**（x64+arm64 一个 dmg） |
| `ubuntu-22.04` | `.deb` + `.AppImage` |
| `ubuntu-24.04-arm` | `.deb` |

再加上网页版 `dist.zip` 和 GHCR 上的 Docker 镜像。**不做 GitHub Pages**（网页版在 Cloudflare）。

踩过的坑，别再踩：

1. **Pake 的安装包是裸名**（`Chatree.msi` / `chatree.deb` / `Chatree-binary`），
   跨平台/跨架构会重名 —— linux x64 和 arm64 都叫 `chatree.deb`，合并到同一个
   Release 时会互相覆盖。所以 `scripts/collect-artifacts.mjs` 统统重命名成
   `Chatree-<版本>-<平台>-<架构>[.扩展名]`（平台/架构从 `CHATREE_PLATFORM` /
   `CHATREE_ARCH` 读，由矩阵传）。
2. **`macos-13`（Intel）拿不到机器** —— 实测排队 19 分钟仍是 `queued`。
   改用 `macos-14` + `--multi-arch`；但**得自己 `rustup target add x86_64-apple-darwin`**，
   Pake 不会帮你装（它只负责传 `--target universal-apple-darwin`）。
3. **`windows-11-arm` 必挂** —— Pake 3.17.1 的命名 bug，详见 `ROADMAP.md`。
4. `release` job 的 `if` 用的是 `!cancelled()` 而不是 `needs.desktop.result == 'success'`：
   某一个平台挂了不该把其余已成功的平台一起埋掉。
5. Pake 找不到某个安装包时会报 `BUILD_FAILED` + ENOENT，而且**因为报错发生在
   `copyRawBinary` 之前，连原始 exe 都不会被拷出来**（`outputs` 是空的）——
   看日志时别被 “安装包构建成功” 那几行骗了。

---

## 9. 已知坑：Vite 缓存中毒

`vite.config.ts` 里配了 `server.watch.awaitWriteFinish`。Windows 上如果文件"截断重写"的
瞬间被 chokidar 捕获，Vite 会读到半截内容并**缓存**下来，之后该模块一直返回空，整个应用白屏
（`does not provide an export named 'default'`）。遇到就删 `node_modules/.vite` 重启。

---

## 10. 提交前自检

```bash
bun run lint
bunx tsc --noEmit -p tsconfig.app.json
bunx tsc --noEmit -p tsconfig.node.json
bun test:edge
bun run build
```

改了节点交互 / 排版，再补跑 `bun test:ux`（需要 §6 的环境）。

---

## 11. 文档地图

| 文件 | 职责 |
|---|---|
| `README.md` / `README_CN.md` | 面向用户：是什么、怎么用、截图 |
| `docs/DEV.md`（本文件） | 面向开发者 + Agent：契约、约定、坑、测试 |
| `docs/ROADMAP.md` | **只放没做的**，做完就删条目 |
| `CHANGELOG.md` | 按版本流水 |
| `AGENTS.md` | 指向本文件（软链） |
