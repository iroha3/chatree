import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const chatFlowSrc = fs.readFileSync(
  path.resolve(import.meta.dirname, '../src/components/ChatFlow.tsx'),
  'utf-8'
);

console.log('Testing TreeEdge implementation and 1px jog elimination...');

// 1. TreeEdge definition exists
assert.ok(
  chatFlowSrc.includes('const TreeEdge: React.FC<EdgeProps>'),
  'ChatFlow must define TreeEdge component'
);
console.log('ok    ChatFlow defines TreeEdge custom edge component');

// 2. Exact midY calculation without dual horizontal lines
assert.ok(
  chatFlowSrc.includes('const midY = (sourceY + targetY) / 2;'),
  'TreeEdge must use exact midY for horizontal segment'
);
console.log('ok    TreeEdge calculates single unified midY');

// 3. ReactFlow edgeTypes is registered
assert.ok(
  chatFlowSrc.includes('edgeTypes={edgeTypes}') && chatFlowSrc.includes('type: \'tree\''),
  'ChatFlow must register edgeTypes with tree and smoothstep'
);
console.log('ok    ReactFlow registers edgeTypes and uses tree edge type');

// 4. Vertical alignment straight line optimization
assert.ok(
  chatFlowSrc.includes('Math.abs(sourceX - targetX) < 1'),
  'TreeEdge draws straight vertical line when source and target are horizontally aligned'
);
console.log('ok    TreeEdge optimizes vertically aligned nodes to single straight line');

console.log('\nAll TreeEdge checks passed!');
