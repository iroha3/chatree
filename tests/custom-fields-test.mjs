/**
 * 模型自定义字段 (customHeaders / customBody) 与动态插值测试
 */

import { interpolateVariables, interpolateDeep } from '../src/services/apiService.ts';
import { buildExportFile } from '../src/utils/sessionTransfer.ts';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}

console.log('--- 测试 1: interpolateVariables ---');
check('基础变量替换', interpolateVariables('prefix-{{sessionId}}-suffix', { sessionId: 'sess-123' }), 'prefix-sess-123-suffix');
check('带空格的占位符', interpolateVariables('{{  sessionId  }}', { sessionId: 'sess-123' }), 'sess-123');
check('不存在的变量原样保留', interpolateVariables('{{unknownKey}}', { sessionId: 'sess-123' }), '{{unknownKey}}');

console.log('\n--- 测试 2: interpolateDeep ---');
const deepInput = {
  header: '{{sessionId}}',
  sub: {
    title: 'chat-{{sessionTitle}}',
    num: 123,
    bool: true,
  },
  list: ['item-{{sessionId}}', 456],
};
const deepExpected = {
  header: 'sess-abc',
  sub: {
    title: 'chat-React-Discussion',
    num: 123,
    bool: true,
  },
  list: ['item-sess-abc', 456],
};
check('深度对象变量替换', interpolateDeep(deepInput, { sessionId: 'sess-abc', sessionTitle: 'React-Discussion' }), deepExpected);

console.log('\n--- 测试 3: 导出脱敏 (buildExportFile) ---');
const sampleModel = {
  id: 'm1',
  name: 'DS Custom',
  baseUrl: 'http://pi:8090',
  apiKey: 'sk-secret-123',
  modelName: 'deepseek-chat',
  defaultSystemPrompt: '',
  maxTokens: 4096,
  temperature: 0.7,
  customHeaders: {
    'X-Conversation-Id': '{{sessionId}}',
    'Authorization': 'Bearer sk-manual-secret',
    'x-api-key': 'secret-key-456',
  },
  customBody: {
    thinking_mode: true,
    search_enabled: false,
  },
};

// 1. 本地导出 (keepApiKeys = false) -> 脱敏
const publicExport = buildExportFile([], [sampleModel], [], { keepApiKeys: false });
const exportedModel = publicExport.models[0];
check('公开导出抹除 apiKey', exportedModel.apiKey, '');
check('公开导出抹除 customHeaders 里的敏感鉴权头', exportedModel.customHeaders, {
  'X-Conversation-Id': '{{sessionId}}',
});
check('公开导出保留 customBody', exportedModel.customBody, {
  thinking_mode: true,
  search_enabled: false,
});

// 2. WebDAV 同步导出 (keepApiKeys = true) -> 保留全部
const privateExport = buildExportFile([], [sampleModel], [], { keepApiKeys: true });
const syncModel = privateExport.models[0];
check('私有同步保留完整 apiKey', syncModel.apiKey, 'sk-secret-123');
check('私有同步保留全部 customHeaders', syncModel.customHeaders, {
  'X-Conversation-Id': '{{sessionId}}',
  'Authorization': 'Bearer sk-manual-secret',
  'x-api-key': 'secret-key-456',
});
check('私有同步保留完整 customBody', syncModel.customBody, {
  thinking_mode: true,
  search_enabled: false,
});

if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n✅ All custom field tests passed successfully!');
}
