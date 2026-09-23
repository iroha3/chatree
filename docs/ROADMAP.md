# Roadmap

> **只放还没做的。**做完就删条目 —— 历史看 `CHANGELOG.md`，约束和坑看 `DEV.md`。
>
> 状态：`📋 待做` · `🟡 讨论中` · `⏸ 押后` · `🚫 明确不做`

---

## 桌面 / 分发

- 📋 **Windows ARM64 包**：`windows-11-arm` 现在是**不能出**的 —— Pake 3.17.1 的
  文件名 bug：Tauri 产出 `Chatree_0.1.0_arm64_en-US.msi`，而 Pake 去找
  `Chatree_0.1.0_aarch64_en-US.msi`（`ARCH_DISPLAY_NAMES.arm64 = 'aarch64'`），
  于是 ENOENT → `BUILD_FAILED`，而且报错发生在 `copyRawBinary` 之前，
  连原始 exe 都不会被拷出来。可选项：① 等上游修（升 Pake 版本后重试）；
  ② 在 `scripts/pake.mjs` 里加一层兜底：从报错路径反推出 target 目录，
  直接扫 `bundle/**` 里真正的产物。目前先不做 ——
  **Windows on ARM 直接跑我们的 x64 包**（系统自带 x64 模拟）就够用了。
- 📋 **代码签名**：现在没签名，首次运行 Windows 会弹 SmartScreen「未知发布者」，
  点「更多信息 → 仍要运行」。要消除得买代码签名证书。
- 🟡 **更新方式**：当前是"半自动"——关于页查 GitHub latest release，有新版本给下载链接。
  够用；静默自动更新需要 Tauri updater 插件 + 更新包签名 + 自己维护 `src-tauri`，
  押后。
- 📋 **首次进桌面版的数据引导**：桌面 origin（`http://tauri.localhost`）和浏览器不共享
  IndexedDB。新用户第一次打开桌面版时，可以主动提示"从浏览器导出的 JSON 可在此导入"。
- 🚫 **单文件 HTML**：`file://` 下 ES module 被 CORS 拦、IndexedDB origin 不可靠，
  意义不大。网页版走静态托管即可。

## 性能

- 📋 **流式输出时的画布闪烁**：根因已定位 —— `ChatFlow` 的 `onChunk`/`onReasoning`
  每个 SSE 分片都 `setState`（50–100 次/秒），`md-editor-rt` 把整篇 Markdown 重新解析并
  换掉整块 DOM。方案：合并到 ~80ms 一批（**收尾必须补一次 flush**），必要时流式期间
  关掉高亮。
- 📋 **流式过程节流落盘**：回答是生成完才落盘的，`streamingResponses` 只在内存里，
  **刷新会丢掉已生成的一半**。建议每 ~500ms 或每 200 字写一次。（"停止"已经会保存
  已生成部分，但刷新不会。）
- 📋 **打包瘦身**：首屏 JS ~392KB gzip（highlight.js ~56KB、katex ~78KB）。
  katex 改成动态 import，只在回答里真的出现公式时才加载。

## 正确性 / 测试

- 📋 **补自动测试**：分支上下文组装、持久化、SSE 解析、`sessionTransfer` 导入校验、
  `sessionStore.importSessions` 去重、`computeChildPosition` 落点不重叠。
- 📋 **假 SSE 服务器的端到端测试**：现在没有覆盖"流式请求 → 停止 → 已生成内容落盘"。
  起一个本地 SSE server，把模型 baseURL 指过去，就能测。
- 📋 **推理模型兼容层**：不同 provider 的 thinking 流字段/格式不完全一致
  （`reasoning_content` 之外还有别的写法），需要一个显式的适配层。

## 交互（讨论中）

- 🟡 **从上游合并**：本仓库是从 `Anionex/treeAI` 迁过来的独立仓库（不再挂 fork 标记），
  上游若继续更新，需要手动 `git remote add upstream` + cherry-pick。要不要跟、
  跟多频繁，未定。
- ⏸ **复制整条路径为 Markdown**：「根 → 本节点」整条对话导出为 Markdown。
- ⏸ **子树折叠**：节点太多时折叠整棵子树。
- ⏸ **快捷键补齐**。
- 📋 **跨会话 token / 花费累计**：候选功能。

## 移动端（大件，方向未定）

- 🟡 **先拍方向**：A = 只读 + 单节点"路径视图"（轻量）；B = 全画布 + 捏合缩放（重）。
- 验收清单（做到哪条算哪条）：
  - [ ] ≤768px 侧栏变抽屉，不遮挡画布
  - [ ] 卡片宽度自适应，不再横向滚动
  - [ ] 单节点路径视图可读、上下滑动顺畅
  - [ ] 滑条 / 输入框不会误拖画布
  - [ ] 软键盘弹出时输入框不被遮

---

## 🚫 明确不做（别再提）

这些是被明确否决过的，别下次又当成新点子提出来：

- 兄弟分支切换器（`← 2/3 →`）
- 标签、云同步、插件化、mermaid 渲染
- 纯美化类改造

> 关于 mermaid：已关闭（从 CDN 加载 743KB gzip，且不管有没有图都加载）。代码块会降级成
> 普通代码块。真要做得先本地打包，再仿照 katex 加 shim。
