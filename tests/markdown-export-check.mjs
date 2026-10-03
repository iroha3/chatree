/*
 * Markdown 导出规范回归测试
 * 跑：bun tests/markdown-export-check.mjs
 */

import {
  stripHashes,
  removeBoldOutsideCode,
  formatLocalTime,
  computeTreeTopology,
  generateMermaidTopology,
  generateChatreeMarkdown,
  generatePathMarkdown,
} from '../src/utils/markdownExport.ts';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}

function checkMatch(name, text, regex) {
  const ok = regex.test(text);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      expected pattern ${regex}\n      actual: ${text.slice(0, 100)}...`}`);
}

// ── 1. stripHashes 契约测试 ──────────────────────────────────
check('一级标题降级为加粗', stripHashes('# 一级标题'), '**一级标题**');
check('三级标题降级为加粗', stripHashes('### 1. 基本构成'), '**1. 基本构成**');
check('内层加粗吸收', stripHashes('## 方案一：**“水珠胶囊”**'), '**方案一：“水珠胶囊”**');
check('代码块内部的 # 保留原样', stripHashes('```python\n# 这是一个注释\ndef foo(): pass\n```'), '```python\n# 这是一个注释\ndef foo(): pass\n```');
check('波浪线围栏内部的 # 保留原样', stripHashes('~~~sh\n# 注释\necho hello\n~~~'), '~~~sh\n# 注释\necho hello\n~~~');
check('行内代码内部的 glob ** 保持原样', stripHashes('# 匹配 `**/*.js` 路径'), '**匹配 `**/*.js` 路径**');
check('非行首标题（如标签）不转换', stripHashes('这是一段包含 #tag 的文字'), '这是一段包含 #tag 的文字');

// ── 2. formatLocalTime 契约测试 ──────────────────────────────
const timeStr = formatLocalTime('2026-10-03T06:00:00Z');
checkMatch('本地时间格式满足 YYYY-MM-DD HH:mm:ss ±HH:MM', timeStr, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/);

// ── 3. 树结构层级编号（Hierarchical Indexing）测试 ────────────
// 构造树：
// root (system)
//   └─ q1 (deepseek) [#1]
//        ├─ q2_a (deepseek) [#2.1]
//        │    └─ q3_a (deepseek) [#3.1]
//        └─ q2_b (claude) [#2.2]
//             ├─ q3_b1 (gpt) [#3.2.1]
//             └─ q3_b2 (gpt) [#3.2.2]
const session = {
  id: 'sess-1',
  title: '测试树状导出会话',
  createdAt: '2026-10-03T10:00:00Z',
  updatedAt: '2026-10-03T10:30:00Z',
  nodes: [
    { id: 'root', parentId: null, type: 'system', userMessage: '你是一个架构师', assistantMessage: '', modelId: 'm-sys', createdAt: '2026-10-03T10:00:00Z' },
    { id: 'q1', parentId: 'root', type: 'chat', userMessage: '什么是分布式系统？', assistantMessage: '分布式系统是……', modelId: 'm-ds', createdAt: '2026-10-03T10:01:00Z' },
    { id: 'q2_a', parentId: 'q1', type: 'chat', userMessage: '方案 A 怎样做容灾？', assistantMessage: '方案 A 容灾……', modelId: 'm-ds', createdAt: '2026-10-03T10:02:00Z' },
    { id: 'q3_a', parentId: 'q2_a', type: 'chat', userMessage: '方案 A 容灾的 RPO 是多少？', assistantMessage: 'RPO 接近 0。', modelId: 'm-ds', createdAt: '2026-10-03T10:03:00Z' },
    { id: 'q2_b', parentId: 'q1', type: 'chat', userMessage: '方案 B 怎样做容灾？', assistantMessage: '方案 B 容灾……', reasoning: '分析方案 B 的 Paxos 选举', modelId: 'm-cl', createdAt: '2026-10-03T10:04:00Z' },
    { id: 'q3_b1', parentId: 'q2_b', type: 'chat', userMessage: 'B1 路线具体成本？', assistantMessage: 'B1 成本较低。', modelId: 'm-gpt', createdAt: '2026-10-03T10:05:00Z' },
    { id: 'q3_b2', parentId: 'q2_b', type: 'chat', userMessage: 'B2 路线具体成本？', assistantMessage: 'B2 成本较高。', modelId: 'm-gpt', createdAt: '2026-10-03T10:06:00Z' },
  ],
};

const models = [
  { id: 'm-ds', name: 'DeepSeek-V3' },
  { id: 'm-cl', name: 'Claude-3.5-Sonnet' },
  { id: 'm-gpt', name: 'GPT-4o' },
];

const topo = computeTreeTopology(session);
check('节点 q1 编号为 #1', topo.metaMap.get('q1').index, '#1');
check('节点 q2_a 编号为 #2.1', topo.metaMap.get('q2_a').index, '#2.1');
check('节点 q2_b 编号为 #2.2', topo.metaMap.get('q2_b').index, '#2.2');
check('节点 q3_a 编号为 #3.1（继承 .1 前缀）', topo.metaMap.get('q3_a').index, '#3.1');
check('节点 q3_b1 编号为 #3.2.1（分裂前缀）', topo.metaMap.get('q3_b1').index, '#3.2.1');
check('节点 q3_b2 编号为 #3.2.2（分裂前缀）', topo.metaMap.get('q3_b2').index, '#3.2.2');
check('叶子分支数为 3 (q3_a, q3_b1, q3_b2)', topo.leafCount, 3);

// ── 4. Mermaid Topology 生成测试 ──────────────────────────────
const mermaid = generateMermaidTopology(session, models, topo);
checkMatch('Mermaid 包含 graph TD 头部', mermaid, /^```mermaid\ngraph TD/m);
checkMatch('Mermaid 包含系统根节点', mermaid, /ROOT\["⚙️ System Prompt"\]/);
checkMatch('Mermaid 节点 q1 带有模型名', mermaid, /N_q1\["#1 · DeepSeek-V3"\]/);
checkMatch('Mermaid 节点 q2_b 带有思考链标记 💭', mermaid, /N_q2_b\["#2\.2 · Claude-3\.5-Sonnet 💭"\]/);

// ── 5. 全文 Markdown 生成测试 ────────────────────────────────
const fullMd = generateChatreeMarkdown(session, models);

// 输出契约验证
const convHeaders = fullMd.match(/^## Conversation$/gm);
check('全文有且仅有一行二级标题 ## Conversation', convHeaders ? convHeaders.length : 0, 1);

checkMatch('Metadata 包含 Mode: tree', fullMd, /- \*\*Mode:\*\* `tree`/);
checkMatch('Metadata 包含去重的 Models 列表', fullMd, /- \*\*Models:\*\* `DeepSeek-V3`, `Claude-3\.5-Sonnet`, `GPT-4o`/);
checkMatch('正文以 System 节点起始', fullMd, /### ⚙️ System\n\n你是一个架构师/);
checkMatch('分叉节点角色头带分支信息', fullMd, /### 🧑‍💻 User — 分支 1\/2/);
checkMatch('正文包含锚点行与分叉来源', fullMd, /> 📌 \*\*Node:\*\* #2\.1 \| \*\*Forked from:\*\* #1/);
checkMatch('包含思考链 Thought Process 与 Response', fullMd, /#### 🤔 Thought Process\n\n分析方案 B 的 Paxos 选举\n\n#### 💡 Response/);

// 正则表达式匹配角色头（输出契约核心兼容性）
const roleRegex = /^###\s+.*\b(User|Assistant|System)\b.*$/gm;
const matchedRoles = fullMd.match(roleRegex);
check('所有消息头均能被角色正则命中', matchedRoles.length, 13); // 1 System + 6 User + 6 Assistant

// ── 6. 单路径线性 Markdown 生成测试 ───────────────────────────
const pathMd = generatePathMarkdown(session, 'q3_b1', models);

const pathConvHeaders = pathMd.match(/^## Conversation$/gm);
check('单路径 Markdown 有且仅有一行二级标题 ## Conversation', pathConvHeaders ? pathConvHeaders.length : 0, 1);

check('单路径 Markdown 不包含 Mode: tree', /- \*\*Mode:\*\*/.test(pathMd), false);
check('单路径 Markdown 不包含 Mermaid Topology', /```mermaid/.test(pathMd), false);
check('单路径 Markdown 不包含节点大纲锚点 > 📌 **Node:**', /> 📌 \*\*Node:\*\*/.test(pathMd), false);
check('单路径 Markdown 用户头不包含分支后缀', /### 🧑‍💻 User — 分支/.test(pathMd), false);
checkMatch('单路径 Metadata Nodes 为 3', pathMd, /- \*\*Nodes:\*\* 3/);
checkMatch('单路径 Metadata Models 包含该路径使用过的模型', pathMd, /- \*\*Models:\*\* `DeepSeek-V3`, `Claude-3\.5-Sonnet`, `GPT-4o`/);
checkMatch('单路径包含思维链 Thought Process 与 Response', pathMd, /#### 🤔 Thought Process\n\n分析方案 B 的 Paxos 选举\n\n#### 💡 Response/);

const pathMatchedRoles = pathMd.match(roleRegex);
check('单路径消息头均能被角色正则命中且为 7 条 (1 Sys + 3 User + 3 Assistant)', pathMatchedRoles ? pathMatchedRoles.length : 0, 7);

if (failed > 0) {
  console.error(`\n❌ Total failed: ${failed}`);
  process.exit(1);
} else {
  console.log('\n✅ All markdown export check tests passed successfully!');
}
