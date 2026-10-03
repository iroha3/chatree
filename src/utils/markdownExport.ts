import { Session, ChatNode, Model } from '../types';
import { buildPath } from './tree';

/**
 * 将正文中的 Markdown 标题语法转换为加粗文本。
 *
 * 规则：
 * 1. 行首为 # ~ ###### 且后接至少一个空格的标题行，转换为 **加粗**；
 * 2. 围栏代码块（``` 或 ~~~）内部原样输出，忽略代码内部的井号；
 * 3. 行内代码外的 ** 须予以吸收移除，防止多层强调导致星号残留；
 * 4. 非行首第 0 列的 #（如缩进代码块或文本中 #tag）保持原样。
 */
export function stripHashes(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const result: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const trimmedStart = line.trimStart();
    const marker = trimmedStart.startsWith('```')
      ? '```'
      : trimmedStart.startsWith('~~~')
        ? '~~~'
        : null;

    if (fence !== null) {
      result.push(line);
      if (marker === fence) {
        fence = null;
      }
    } else if (marker !== null) {
      fence = marker;
      result.push(line);
    } else {
      result.push(stripOneLine(line));
    }
  }

  return result.join('\n');
}

function stripOneLine(line: string): string {
  let count = 0;
  while (count < line.length && line[count] === '#') {
    count++;
  }

  // 必须是 1~6 个井号，且之后紧随空格，行首必须从第 0 列开始
  if (count === 0 || count > 6) return line;
  const rest = line.slice(count);
  if (rest.length === 0 || !/^\s/.test(rest)) return line;

  const inner = rest.trim();
  if (!inner) return line;

  return `**${removeBoldOutsideCode(inner).trim()}**`;
}

/**
 * 移除行内代码段外部的所有 ** 强调符号，保留行内代码内部的内容（如 glob 语法）。
 */
export function removeBoldOutsideCode(text: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  // 匹配由 1 个或多个反引号包裹的行内代码
  const codeRegex = /(`+)([\s\S]*?)\1/g;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(text)) !== null) {
    const nonCode = text.slice(lastIndex, match.index);
    parts.push(nonCode.replace(/\*\*/g, ''));
    parts.push(match[0]);
    lastIndex = codeRegex.lastIndex;
  }
  parts.push(text.slice(lastIndex).replace(/\*\*/g, ''));
  return parts.join('');
}

/**
 * 格式化为输出契约要求的本地时间格式：YYYY-MM-DD HH:mm:ss ±HH:MM
 */
export function formatLocalTime(isoStringOrDate: string | Date = new Date()): string {
  const d = typeof isoStringOrDate === 'string' ? new Date(isoStringOrDate) : isoStringOrDate;
  const date = isNaN(d.getTime()) ? new Date() : d;

  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetH = pad(Math.floor(absOffset / 60));
  const offsetM = pad(absOffset % 60);

  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss} ${sign}${offsetH}:${offsetM}`;
}

interface NodeTopologyMeta {
  index: string;
  parentIndex: string | null;
  branchInfo: { index: number; total: number } | null;
}

/**
 * 对 Chatree 会话树进行拓扑排序与层级大纲编号计算。
 * 根直接子节点为 Level 1。若产生分叉，分配如 #2.1、#2.2 等结构化编号。
 */
export function computeTreeTopology(session: Session): {
  systemNode: ChatNode | null;
  orderedChatNodes: ChatNode[];
  metaMap: Map<string, NodeTopologyMeta>;
  leafCount: number;
} {
  const nodeMap = new Map<string, ChatNode>();
  session.nodes.forEach((n) => nodeMap.set(n.id, n));

  const childrenMap = new Map<string, ChatNode[]>();
  session.nodes.forEach((n) => {
    if (n.parentId) {
      if (!childrenMap.has(n.parentId)) {
        childrenMap.set(n.parentId, []);
      }
      childrenMap.get(n.parentId)!.push(n);
    }
  });

  // 子节点按创建时间严格递增排序
  childrenMap.forEach((list) => {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  // 单根判定：优先找系统节点，或 parentId 为 null 的首个根节点
  const systemNode = session.nodes.find((n) => n.type === 'system') || null;
  let rootNodeId: string | null = systemNode ? systemNode.id : null;

  if (!rootNodeId) {
    const rootNodes = session.nodes
      .filter((n) => !n.parentId || !nodeMap.has(n.parentId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    rootNodeId = rootNodes[0]?.id || null;
  }

  const metaMap = new Map<string, NodeTopologyMeta>();
  const orderedChatNodes: ChatNode[] = [];
  let leafCount = 0;

  if (!rootNodeId) {
    return { systemNode, orderedChatNodes, metaMap, leafCount: 0 };
  }

  // 递归进行 DFS 先序遍历与编号分配
  const traverse = (
    currentId: string,
    depth: number,
    parentIndex: string | null,
    parentBranchPrefix: string | null
  ) => {
    const children = childrenMap.get(currentId) || [];
    const isLeaf = children.length === 0;
    if (isLeaf && currentId !== rootNodeId) {
      leafCount++;
    }

    const hasBranches = children.length > 1;

    children.forEach((child, idx) => {
      if (child.type === 'system') return; // 系统节点不作为下级问答节点

      let branchPrefix: string | null = parentBranchPrefix;
      let currentIndex: string;

      if (hasBranches) {
        branchPrefix = parentBranchPrefix ? `${parentBranchPrefix}.${idx + 1}` : `${idx + 1}`;
        currentIndex = `#${depth}.${branchPrefix}`;
      } else {
        currentIndex = parentBranchPrefix ? `#${depth}.${parentBranchPrefix}` : `#${depth}`;
      }

      metaMap.set(child.id, {
        index: currentIndex,
        parentIndex,
        branchInfo: hasBranches ? { index: idx + 1, total: children.length } : null,
      });

      orderedChatNodes.push(child);

      traverse(child.id, depth + 1, currentIndex, branchPrefix);
    });
  };

  // 若根节点本身就是 chat 节点（无系统提示词），它作为 Level 1 节点
  const rootNode = nodeMap.get(rootNodeId);
  if (rootNode && rootNode.type !== 'system') {
    const rootIndex = '#1';
    metaMap.set(rootNode.id, {
      index: rootIndex,
      parentIndex: null,
      branchInfo: null,
    });
    orderedChatNodes.push(rootNode);
    traverse(rootNode.id, 2, rootIndex, null);
  } else {
    // 根为 system 节点，子节点从 depth = 1 开始编号
    traverse(rootNodeId, 1, null, null);
  }

  return {
    systemNode,
    orderedChatNodes,
    metaMap,
    leafCount: Math.max(leafCount, 1),
  };
}

/**
 * 清洗 Mermaid 节点显示文本，避免由于双引号、方括号等导致语法崩溃。
 */
function cleanMermaidText(str: string): string {
  return str
    .replace(/"/g, "'")
    .replace(/[\[\]\(\)\{\}<>]/g, '')
    .trim();
}

/**
 * 生成纯逻辑 Mermaid 树图
 */
export function generateMermaidTopology(
  session: Session,
  models: Model[],
  topology: ReturnType<typeof computeTreeTopology>
): string {
  const { systemNode, orderedChatNodes, metaMap } = topology;
  const modelMap = new Map(models.map((m) => [m.id, m.name]));

  const lines: string[] = ['```mermaid', 'graph TD'];

  if (systemNode) {
    lines.push('  ROOT["⚙️ System Prompt"]');
  }

  for (const node of orderedChatNodes) {
    const meta = metaMap.get(node.id);
    if (!meta) continue;

    const safeId = `N_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const rawModelName = modelMap.get(node.modelId) || node.modelId || 'AI';
    const modelName = cleanMermaidText(rawModelName);
    const reasoningMarker = node.reasoning?.trim() ? ' 💭' : '';
    const label = `${meta.index} · ${modelName}${reasoningMarker}`;

    lines.push(`  ${safeId}["${label}"]`);

    if (node.parentId && metaMap.has(node.parentId)) {
      const parentSafeId = `N_${node.parentId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`  ${parentSafeId} --> ${safeId}`);
    } else if (systemNode && node.parentId === systemNode.id) {
      lines.push(`  ROOT --> ${safeId}`);
    } else if (systemNode && !node.parentId) {
      lines.push(`  ROOT --> ${safeId}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * 将 Chatree 会话树完整导出为符合输出契约的 Markdown 字符串。
 */
export function generateChatreeMarkdown(session: Session, models: Model[]): string {
  const topology = computeTreeTopology(session);
  const { systemNode, orderedChatNodes, metaMap, leafCount } = topology;

  const modelMap = new Map(models.map((m) => [m.id, m.name]));

  // 收集所有使用过的模型名称（去重，保持首次出现顺序）
  const modelNames: string[] = [];
  const seenModels = new Set<string>();
  orderedChatNodes.forEach((n) => {
    const name = modelMap.get(n.modelId) || n.modelId;
    if (name && !seenModels.has(name)) {
      seenModels.add(name);
      modelNames.push(name);
    }
  });

  const topologyMermaid = generateMermaidTopology(session, models, topology);

  const sections: string[] = [];

  // ── 1. Metadata 区 ──────────────────────────────────────
  const metadataLines: string[] = ['## Metadata', ''];
  metadataLines.push(`- **Mode:** \`tree\``);
  if (modelNames.length > 0) {
    metadataLines.push(`- **Models:** ${modelNames.map((m) => `\`${m}\``).join(', ')}`);
  }
  metadataLines.push(`- **Nodes:** ${orderedChatNodes.length}`);
  metadataLines.push(`- **Branches:** ${leafCount}`);
  metadataLines.push(`- **Time:** ${formatLocalTime(session.createdAt)}`);
  metadataLines.push('');
  metadataLines.push('### 🗺️ Topology');
  metadataLines.push('');
  metadataLines.push(topologyMermaid);

  sections.push(metadataLines.join('\n'));

  // ── 2. Conversation 正文区 ─────────────────────────────────
  const conversationLines: string[] = ['## Conversation', ''];

  if (systemNode && systemNode.userMessage?.trim()) {
    conversationLines.push('### ⚙️ System');
    conversationLines.push('');
    conversationLines.push(stripHashes(systemNode.userMessage.trim()));
    conversationLines.push('');
  }

  for (const node of orderedChatNodes) {
    const meta = metaMap.get(node.id);
    const modelName = modelMap.get(node.modelId) || node.modelId || 'AI';

    // 用户消息头
    if (meta?.branchInfo) {
      conversationLines.push(`### 🧑‍💻 User — 分支 ${meta.branchInfo.index}/${meta.branchInfo.total}`);
    } else {
      conversationLines.push('### 🧑‍💻 User');
    }
    conversationLines.push('');

    // 节点坐标定位线索
    const anchorText = meta?.parentIndex
      ? `> 📌 **Node:** ${meta.index} | **Forked from:** ${meta.parentIndex}`
      : `> 📌 **Node:** ${meta?.index || '#1'}`;
    conversationLines.push(anchorText);
    conversationLines.push('');

    if (node.userMessage?.trim()) {
      conversationLines.push(stripHashes(node.userMessage.trim()));
    } else {
      conversationLines.push('*(空)*');
    }
    conversationLines.push('');

    // 助手消息头
    conversationLines.push(`### 🤖 Assistant — ${modelName}`);
    conversationLines.push('');

    const hasReasoning = !!node.reasoning?.trim();
    if (hasReasoning) {
      conversationLines.push('#### 🤔 Thought Process');
      conversationLines.push('');
      conversationLines.push(stripHashes(node.reasoning!.trim()));
      conversationLines.push('');
      conversationLines.push('#### 💡 Response');
      conversationLines.push('');
    }

    if (node.assistantMessage?.trim()) {
      conversationLines.push(stripHashes(node.assistantMessage.trim()));
    } else {
      conversationLines.push('*(空)*');
    }
    conversationLines.push('');
  }

  sections.push(conversationLines.join('\n'));

  return sections.join('\n\n') + '\n';
}

/**
 * 触发浏览器端下载会话树 Markdown 文件。
 */
export function exportSessionToMarkdown(session: Session, models: Model[]): void {
  const content = generateChatreeMarkdown(session, models);
  const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'chatree_session';

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle}.md`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 将从根到 targetNodeId 的单一线性路径导出为符合 AC 基础规范的一维 Markdown 文本。
 * 纯线性对话不包含 Mode 标识、Topology 导览图、层级分支大纲编号及锚点线索。
 */
export function generatePathMarkdown(session: Session, targetNodeId: string, models: Model[]): string {
  const path = buildPath(session.nodes, targetNodeId);
  const systemNode = path.find((n) => n.type === 'system');
  const chatNodes = path.filter((n) => n.type === 'chat');

  const modelMap = new Map(models.map((m) => [m.id, m.name]));

  // 收集该路径上使用过的模型名称（去重，保持首次出现顺序）
  const modelNames: string[] = [];
  const seenModels = new Set<string>();
  chatNodes.forEach((n) => {
    const name = modelMap.get(n.modelId) || n.modelId;
    if (name && !seenModels.has(name)) {
      seenModels.add(name);
      modelNames.push(name);
    }
  });

  const sections: string[] = [];

  // ── 1. Metadata 区 ──────────────────────────────────────
  const metadataLines: string[] = ['## Metadata', ''];
  if (modelNames.length > 0) {
    metadataLines.push(`- **Models:** ${modelNames.map((m) => `\`${m}\``).join(', ')}`);
  }
  metadataLines.push(`- **Nodes:** ${chatNodes.length}`);
  metadataLines.push(`- **Time:** ${formatLocalTime(session.createdAt)}`);

  sections.push(metadataLines.join('\n'));

  // ── 2. Conversation 正文区 ─────────────────────────────────
  const conversationLines: string[] = ['## Conversation', ''];

  if (systemNode && systemNode.userMessage?.trim()) {
    conversationLines.push('### ⚙️ System');
    conversationLines.push('');
    conversationLines.push(stripHashes(systemNode.userMessage.trim()));
    conversationLines.push('');
  }

  for (const node of chatNodes) {
    const modelName = modelMap.get(node.modelId) || node.modelId || 'AI';

    conversationLines.push('### 🧑‍💻 User');
    conversationLines.push('');

    if (node.userMessage?.trim()) {
      conversationLines.push(stripHashes(node.userMessage.trim()));
    } else {
      conversationLines.push('*(空)*');
    }
    conversationLines.push('');

    conversationLines.push(`### 🤖 Assistant — ${modelName}`);
    conversationLines.push('');

    const hasReasoning = !!node.reasoning?.trim();
    if (hasReasoning) {
      conversationLines.push('#### 🤔 Thought Process');
      conversationLines.push('');
      conversationLines.push(stripHashes(node.reasoning!.trim()));
      conversationLines.push('');
      conversationLines.push('#### 💡 Response');
      conversationLines.push('');
    }

    if (node.assistantMessage?.trim()) {
      conversationLines.push(stripHashes(node.assistantMessage.trim()));
    } else {
      conversationLines.push('*(空)*');
    }
    conversationLines.push('');
  }

  sections.push(conversationLines.join('\n'));

  return sections.join('\n\n') + '\n';
}

/**
 * 触发浏览器端下载单路径线性 Markdown 文件。
 */
export function exportPathToMarkdown(session: Session, targetNodeId: string, models: Model[]): void {
  const content = generatePathMarkdown(session, targetNodeId, models);
  const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'chatree_path';

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle}_path.md`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

