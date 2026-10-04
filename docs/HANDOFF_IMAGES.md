# HANDOFF：带图片聊天 + 同步体积优化

> 状态：**仅讨论完毕，未写任何代码。** 本文档是讨论结论的交接，不是正式决策。
> 动手前请先读 `docs/DEV.md`（AGENTS.md）的 §1 数据契约、§3 交互约定。
> 正式落地时，按 §11.2 的协作契约把「为什么」拆进 `DECISIONS.md`，「做什么」进 `ROADMAP.md`。

---

## 0. 背景与定位

- 用户希望聊天支持带图片：输入框旁加图按钮、Ctrl+V 贴图、缩略图小徽章、悬停 × 删除、点击放大。
- **图片是二等公民**：优先保证「能带图聊」；导出（Markdown / 手动 JSON）**无视图片，连占位符都不留**。
- 项目版本号 0 开头，**允许 breaking change**，目前只有作者一人使用。**唯一硬约束：已有会话不能丢。**
- 不维护「模型是否支持图片」名单。不支持的 API 会返回报错，用户删图重发即可；只加一句提示文案（见 §3.3）。
- API 格式只考虑 OpenAI 兼容的 `/chat/completions`。

## 1. 已定的决策

| # | 决策 | 备注 |
|---|---|---|
| 1 | 新增 Dexie 表 `attachments`，节点只存引用 | 加表不改已有契约 |
| 2 | 上传时压缩，**一次性**，之后字节不变 | 保证前缀缓存可命中 |
| 3 | 历史节点的图片**每轮全量重发**，不做开关 | API 无状态；丢旧图会破坏缓存和追问语义 |
| 4 | 图片**随同步一起走**，不做「只同步引用」的过渡期 | 用户：要整就整利索，流量自担 |
| 5 | 同步文件内联 base64 + **gzip** | 见 §4 |
| 6 | 导出一律忽略图片 | 二等公民 |
| 7 | 同步前快照不含图片 | attachments 表不动，恢复后引用自然对得上 |

## 2. 存储层

- Dexie v5：`attachments: 'id'`，记录 `{ id, blob, mime, w, h, size, createdAt }`。
  - 需要 `createdAt` 才能做宽限期清理。
- `ChatNode.images?: { id: string; mime: string }[]`（`src/types.ts`，可选字段，旧数据无此字段）。
- **图片 id 用内容哈希**（如 SHA-256 的前若干位）：内容不可变 → 同步合并 = 两边取**并集**，无冲突、无需墓碑。
- 删除节点 / 会话时**不碰 attachments 表**。8 秒撤销窗口因此天然安全，无需「恢复图片」逻辑。

### 压缩参数（建议默认值）
- 长边 **1280px**，WebP 质量 **0.75**，预期 50–150KB/张。更激进可用 1024px / 0.7（代价：截图小字发糊）。
- 依据：视觉模型自己也会缩图（Claude 长边 >1568 会被缩；OpenAI 按 512px 切块计 token），更大的像素是白占体积。
- **坑 1**：Safari 的 `canvas.toBlob('image/webp')` 会**静默回退成 PNG**，体积反而更大。必须检查 `blob.type`，不对就改 JPEG。
- **坑 2**：JPEG 无透明通道，透明 PNG 需先垫白底。

### 清理（待定，倾向「同步合并时就地剔除未被引用的图片」）
- 图片随同步走后，图片库体积直接决定同步流量，所以清理比之前预想的更重要。
- 之前考虑过「启动时扫描 + 24 小时宽限」；若采用，扫描需在同步进行时跳过，避免竞态。
- 个人使用下，也可以 v1 完全不清理（单张 50–150KB）。**此项尚未最终拍板。**

## 3. 请求层与 UI

### 3.1 请求层
- 请求体拼装位置：`src/components/ChatFlow.tsx` 约 L859–884（`runNodeGeneration`）。
- 只有带图的用户消息才把 `content` 改成数组：
  `[{type:'text',text}, {type:'image_url', image_url:{url:'data:<mime>;base64,...'}}]`；纯文本仍发字符串，不影响现有兼容性。
- `src/services/apiService.ts` 的 `ChatMessage.content` 类型需放宽为 `string | ContentPart[]`。
- 发请求时从 attachments 表取 blob 转 base64。

### 3.2 UI（`src/components/nodes/ChatNode.tsx`）
- 输入框旁加图按钮；编辑态 textarea 监听 `paste`，读 `clipboardData.files`。
- 缩略图：挂在输入框角上的小方形徽章；悬停显示 ×（仅编辑态可删）；点击在 portal 里放大。
- 灯箱 z-index：高于阅读浮层 `z-[100]`，低于 Toast `z-[300]`。
- 只读态也显示缩略图，不可删。
- 遵守约定：控件加 `nodrag nopan`；图标 `size={14}`；不用半透明白底（见 §3.3 的 ❌ 列表）。

### 3.3 报错提示文案
- 错误文本匹配 `image|vision|multimodal|content` 时，在节点错误里补一句「该模型可能不支持图片，可删除图片后重试」。纯提示，不拦截。

### 3.4 其他关联点（容易漏）
| 位置 | 需要处理 |
|---|---|
| 发送按钮禁用条件 | 现在是 `!userMessage.trim()`；改为「有文字或有图」都可发（ChatNode.tsx 约 L505） |
| 重新生成分支 `onRetry` | 拷贝 `userMessage` 时同时拷贝 `images` |
| 编辑后重答 | 允许在编辑态增删图片 |
| `PathReaderOverlay.tsx` | 阅读浮层显示图片 |
| 会话标题 `deriveSessionTitle` | 只发图无文字时需要兜底 |
| i18n | 新文案补进词典（漏翻会回退中文，可增量） |

## 4. 同步与快照（本期最大的收益点，也可**独立于图片先做**）

### 现状（已核实代码）
- `syncStore.sync()`（`src/stores/syncStore.ts` L149 起）流程：存快照 → 下载 → `mergeBidirectional` → 整份上传。
- `savePreSyncSnapshot()`（`src/utils/syncMerge.ts` L24）把全部会话/模型/文件夹/墓碑序列化成 JSON，存入 IndexedDB `syncSnapshots`，用于「撤销上次同步」。
- ⚠️ **文档与代码不一致**：AGENTS.md §3.18 写「保留最新 5 份」，但代码里 `SNAPSHOT_KEY = 'pre-sync-latest'` 是固定 key、覆盖写，**实际只有 1 份**。需要修正文档或代码。
- 本地因此有「一份完整数据 + 一份完整快照」，体积翻倍。

### 起因
作者实测：约 20 个纯文本会话，同步配置文件已近 1MB。文本压缩率高（通常 5–10 倍）。

### 方案
- 同步文件改用 gzip：`CompressionStream('gzip')` / `DecompressionStream`，**不加依赖**。
- 读取时**先试 gzip，失败再按明文 JSON 读**，保证旧云端文件仍可读，会话不丢。
- 快照同样可压缩后再存，降低本地 IndexedDB 占用。
- 需要同步调整：`WebDavSyncSection` / `services/webdav.ts` 里 AList「返回 HTML 页面而非 JSON」的签名校验（见 AGENTS.md §3.18-6），gzip 后的二进制不能再按文本判断。
- 图片内联 base64 进同步文件；gzip 能把 base64 的 ~33% 开销还回来（图片本身已压缩，不会再缩小）。
- 手动「导出 JSON」保持明文、不含图片。

### 建议的推进顺序
1. **先单独做 gzip 同步 + 快照压缩**（收益大、风险小，与图片无关）。
2. 再做带图聊天（存储 → 请求层 → UI → 同步带图）。
3. 清理机制最后定。

## 5. 未决问题：桌面版（Pake/Tauri）Ctrl+V 贴图

> 用户反馈「客户端的 Ctrl+V 图片不能用」。**原因未确认，不要当成已知结论。**

- 我曾错误地断言「Ctrl+V 不受桌面版影响」，已更正：该说法**未经验证**。
- 已核实：仓库里没有任何 `paste` 监听；`pake.config.json` 有 `disabledWebShortcuts: true`（**是否会拦 Ctrl+V 未知**，需看 Pake 实现）。
- 网上搜索摘要称「WebView2 读不到图片剪贴板，需用 Tauri clipboard 插件」，**无一手来源，且与 Chromium 对 `paste` 事件的一般行为不符**；另一条摘要称 Pake 近期修过 Ctrl+V 兼容问题，可能与 Pake 版本有关。

### 排查步骤（下一步）
先加临时调试监听，在桌面版里贴一次图，看控制台：

```ts
textarea.addEventListener('paste', e => {
  console.log('types', Array.from(e.clipboardData?.types ?? []),
              'files', e.clipboardData?.files.length);
});
```

| 现象 | 含义 | 成本 |
|---|---|---|
| `files` 里有图 | 浏览器通道正常，只是没人监听 | 零 |
| `types` 无图片类型 | Pake / WebView2 没传 | 需走原生通道 |
| 事件没触发 | 快捷键被拦（疑 `disabledWebShortcuts`） | 改配置，低 |

### 若必须走原生通道
- 需要 Tauri `clipboard-manager` 插件 + capabilities + `Cargo.toml` + 插件注册 → **打破 AGENTS.md §8「仓库里不出现 Rust」**，或需 Pake 提供扩展点（**未确认是否有**）。
- 前端要区分网页 / 桌面两条路径，测试负担增加。
- 避免用 `navigator.clipboard.read()`：与 §3.5 记录的 `writeText` 同类，WebView2 里会弹原生授权框；只用 `paste` 事件。
- **兜底**：文件选择按钮不依赖剪贴板，桌面版最坏情况是「只能点按钮上传，不能贴图」，可接受。
- 注意 `enableDragDrop: false`（§8-1）：桌面版**拖拽文件进输入框也不可用**，不要把拖拽当作桌面版方案。

## 6. 工作量与风险评估
- 图片本身：约 400–600 行**加性**代码，可整体回滚；不触碰任何 §1 数据契约。
- 真正的风险只在同步 / 快照（体积、旧格式兼容、AList 校验）。
- 明确**不碰**：Markdown 导出、手动 JSON 导出、同步的增量协议。
- 回归：改节点交互后需补跑 `bun test:ux`（`tests/node-ux-check.mjs` 会量 `svg[width]` 和右对齐，新增图标/按钮要沿用 14px 与 25px 约定）。

## 7. 待办清单（给下一位接手者）

- [ ] 在桌面版实测 Ctrl+V，确定 §5 属于哪种情况
- [ ] gzip 同步 + 快照压缩（含明文回退读取、AList HTML 校验调整）
- [ ] 修正文档或代码：快照实际 1 份 vs 文档写 5 份
- [ ] `attachments` 表（Dexie v5）+ 压缩工具（含 Safari WebP 回退、透明垫白）
- [ ] `ChatNode.images` 类型 + 请求层 content 数组
- [ ] ChatNode UI：加图按钮、paste、徽章、× 删除、灯箱
- [ ] 重新生成拷贝 images；发送按钮条件；标题兜底；阅读浮层显示
- [ ] 同步合并：attachments 取并集；图片内联进 gzip 同步文件
- [ ] 清理策略拍板（同步时剔除 / 启动扫描 / 不做）
- [ ] 按 §11.2 补 `DECISIONS.md`、`ROADMAP.md`、`CHANGELOG.md [Unreleased]`、`DEV.md`
- [ ] i18n 补词

## 8. 尚未最终拍板的点
1. 压缩参数 1280px/0.75 还是 1024px/0.7（用户说「尺寸大点无非多走点流量」，倾向偏大）。
2. 清理机制三选一（§2）。
3. 是否去核实 Cherry Studio 对历史图片的处理（仅印象为「随上下文一并发送」，**未查证**；不影响本方案结论）。
