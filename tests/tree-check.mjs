/*
 * 会话树查询的纯逻辑回归（buildPath / childrenOf / branchGroup）。
 *
 * 连续阅读整条路径靠的就是 buildPath —— 一旦它拿错父链，用户读到的就是
 * 「别人的对话」。而数据是用户自己的、可能很脏（父节点被删过、甚至成环），
 * 所以这里重点测**坏数据不许死循环、不许抛异常**。
 *
 * 跑：bun test:tree
 */

import { buildPath, childrenOf, branchGroup } from '../src/utils/tree.ts';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}

const n = (id, parentId, createdAt) => ({
  id, parentId, type: parentId ? 'chat' : 'system',
  userMessage: id, assistantMessage: '', modelId: 'm1',
  temperature: 0.7, maxTokens: 8192, createdAt,
});

// 一条主干 + 一个分叉：
//   root ─ a ─ b ─ c
//              └ d ─ e
const root = n('root', null, '2024-01-01T00:00:00Z');
const a = n('a', 'root', '2024-01-02T00:00:00Z');
const b = n('b', 'a', '2024-01-03T00:00:00Z');
const c = n('c', 'b', '2024-01-04T00:00:00Z');
const d = n('d', 'b', '2024-01-05T00:00:00Z');
const e = n('e', 'd', '2024-01-06T00:00:00Z');
const nodes = [root, a, b, c, d, e];

const ids = (arr) => arr.map((x) => x.id);

// ---- buildPath ----
check('叶子节点 → 一条完整的根到叶路径', ids(buildPath(nodes, 'c')), ['root', 'a', 'b', 'c']);
check('中间节点 → 路径停在它自己', ids(buildPath(nodes, 'b')), ['root', 'a', 'b']);
check('另一个分叉上的叶', ids(buildPath(nodes, 'e')), ['root', 'a', 'b', 'd', 'e']);
check('根节点自己 → 只有它', ids(buildPath(nodes, 'root')), ['root']);
check('不存在的节点 → 空数组', ids(buildPath(nodes, 'nope')), []);

// 坏数据：父节点被删掉了，就停在断点处，不抛异常
check('父节点缺失 → 停在断点', ids(buildPath([a, b], 'b')), ['a', 'b']);

// 坏数据：成环。绝不能死循环（这里就是防这个的）。
const loopA = n('la', 'lb', '2024-01-01T00:00:00Z');
const loopB = n('lb', 'la', '2024-01-02T00:00:00Z');
const loopPath = buildPath([loopA, loopB], 'la');
check('成环数据不卡死，且每个节点只出现一次', loopPath.length, 2);

// ---- childrenOf ----
check('子节点按创建时间排序', ids(childrenOf(nodes, 'b')), ['c', 'd']);
check('叶子没有子节点', ids(childrenOf(nodes, 'c')), []);

// ---- branchGroup ----
check('兄弟组含自己，且按时间排序', ids(branchGroup(nodes, 'd')), ['c', 'd']);
check('独生子只有自己', ids(branchGroup(nodes, 'a')), ['a']);
check('多个根也是「兄弟」', ids(branchGroup([root, n('root2', null, '2024-02-01T00:00:00Z')], 'root')), ['root', 'root2']);

console.log(failed === 0 ? '\nPASS: 路径 / 子节点 / 兄弟组都对。' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
