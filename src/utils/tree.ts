import { ChatNode } from '../types';

/**
 * 会话树上的只读查询。全是纯函数，不碰 store / DOM。
 *
 * 连续阅读（双击节点打开的那条路径）只是第一个用它的地方；
 * 「复制整条路径为 Markdown」和导出线性文档（见 DECISIONS D-003 A 方案）也用同一套。
 *
 * 注意：`Session.nodes` + `parentId` 本身就是一片**森林**（`parentId: null` 可以有好几个），
 * 所以这里一律按「多根」写 —— 别假设只有一棵树。
 */

/** 按创建时间排序（升序）。原始字符串比较不够用，时间戳更稳。 */
function byCreatedAt(a: ChatNode, b: ChatNode): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/**
 * 从 `nodeId` 沿 `parentId` 一路往上到根，返回 `[根, …, nodeId]`。
 *
 * - 节点不存在 → `[]`
 * - 父节点丢了（数据损坏 / 被删过）→ 就停在那里，不报错
 * - 数据里万一成了环 → `seen` 兜底，绝不无限循环
 */
export function buildPath(nodes: ChatNode[], nodeId: string): ChatNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: ChatNode[] = [];
  const seen = new Set<string>();

  let cur = byId.get(nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  return path.reverse();
}

/** 直接子节点，按创建时间排序。 */
export function childrenOf(nodes: ChatNode[], nodeId: string): ChatNode[] {
  return nodes.filter((n) => n.parentId === nodeId).sort(byCreatedAt);
}

/**
 * 一个节点和它的所有兄弟，按创建时间排好序 —— 也就是它在画布上横向那一排。
 * 用它算「分支 2/3」和渲染右侧的分支切换列表。
 */
export function branchGroup(nodes: ChatNode[], nodeId: string): ChatNode[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  return nodes.filter((n) => n.parentId === node.parentId).sort(byCreatedAt);
}

/**
 * 寻找指定节点下游（或整个会话树）创建时间最新的叶子节点。
 *
 * 1. 若传入 `fromNodeId`：从该节点一路沿着最新的子节点向下探到底（用于分支切换后自动选叶）；
 * 2. 若未传入 `fromNodeId`：在整棵树的所有叶子中，返回创建时间最新的那一个（用于打开会话时定位默认叶子）。
 */
export function findLatestLeaf(nodes: ChatNode[], fromNodeId?: string): ChatNode | undefined {
  if (nodes.length === 0) return undefined;

  if (!fromNodeId) {
    const parentIdSet = new Set(nodes.map((n) => n.parentId).filter(Boolean));
    const leaves = nodes.filter((n) => !parentIdSet.has(n.id)).sort(byCreatedAt);
    return leaves[leaves.length - 1] ?? nodes[nodes.length - 1];
  }

  let cur = nodes.find((n) => n.id === fromNodeId);
  if (!cur) return undefined;
  const seen = new Set<string>();

  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const children = childrenOf(nodes, cur.id);
    if (children.length === 0) break;
    cur = children[children.length - 1];
  }
  return cur;
}
