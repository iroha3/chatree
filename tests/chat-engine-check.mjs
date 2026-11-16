/*
 * chatEngine 消息链与流式调度的回归测试。
 *
 * 跑：bun tests/chat-engine-check.mjs
 */

import { buildMessageChain } from '../src/services/chatEngine.ts';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}

const n = (id, parentId, userMessage, assistantMessage = '', type = 'chat') => ({
  id,
  parentId,
  type,
  userMessage,
  assistantMessage,
  modelId: 'm1',
  temperature: 0.7,
  maxTokens: 8192,
  createdAt: new Date().toISOString(),
});

// 测试 1: 正常单链带有系统提示词
const sysNode = n('sys', null, 'You are a helpful assistant.', '', 'system');
const node1 = n('n1', 'sys', 'Hello');
node1.assistantMessage = 'Hi there!';
const node2 = n('n2', 'n1', 'What is 1+1?');

const chain1 = buildMessageChain([sysNode, node1, node2], node2);
check('正常历史对话链路提取', chain1, [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
  { role: 'user', content: 'What is 1+1?' },
]);

// 测试 2: 系统节点为空或被删除时，绝不无中生有
const emptySysNode = n('sys', null, '', '', 'system');
const chain2 = buildMessageChain([emptySysNode, node1, node2], node2);
check('系统提示词为空时无 system 消息', chain2, [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
  { role: 'user', content: 'What is 1+1?' },
]);

const chain3 = buildMessageChain([node1, node2], node2);
check('无系统节点时无 system 消息', chain3, [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
  { role: 'user', content: 'What is 1+1?' },
]);

// 测试 3: 分叉链路只提取本分支上的祖先
const branch1 = n('b1', 'n1', 'Branch 1 question');
branch1.assistantMessage = 'Branch 1 answer';
const branch2 = n('b2', 'n1', 'Branch 2 question');

const chainBranch2 = buildMessageChain([sysNode, node1, branch1, branch2], branch2);
check('分叉节点只带自身祖先，不混入兄弟分支', chainBranch2, [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
  { role: 'user', content: 'Branch 2 question' },
]);

// 测试 4: 成环保护不卡死
const loop1 = n('l1', 'l2', 'Loop 1');
const loop2 = n('l2', 'l1', 'Loop 2');
const loopChain = buildMessageChain([loop1, loop2], loop2);
check('成环数据安全中止，只保留直接目标', loopChain.length >= 1, true);

console.log(failed === 0 ? '\nPASS: chatEngine 消息链构建完全正确。' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
