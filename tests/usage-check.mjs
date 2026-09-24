/*
 * usage / 字数 的数值准确性回归。
 *
 * 这些数字是直接展示给用户的（卡片底部那行「↑ 11 tok · ↓ 22 tok · 缓存 87%」），
 * 一旦映射错字段，用户看到的 token / 缓存命中就是编的。所以：
 *
 *   1) normalizeUsage 只做「换名字」，不做任何本地估算 —— 服务商没给的字段
 *      必须保持 0，绝不能拿字符数除几来脑补；
 *   2) 缓存命中的各种家（DeepSeek / OpenAI / Anthropic）都要认，尤其是
 *      `cached_tokens: 0` 这种「支持缓存但这次没命中」不能退化成「不支持」；
 *   3) countChars 按 Unicode 码点数，emoji 不能算成 2。
 *
 * 跑：bun test:usage
 */

import { normalizeUsage } from '../src/utils/usage.ts';
import { countChars } from '../src/utils/text.ts';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}

// ---- 只做字段映射，不估算 ----
check('只有 prompt/completion/total 时原样透传', normalizeUsage({
  prompt_tokens: 20,
  completion_tokens: 7,
  total_tokens: 27,
}), {
  promptTokens: 20,
  completionTokens: 7,
  totalTokens: 27,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  reasoningTokens: undefined,
});

check('服务商什么都没给 → 全 0，不脑补', normalizeUsage({}), {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  reasoningTokens: undefined,
});

// ---- 各家缓存字段 ----
check('DeepSeek：hit + miss 直接用', normalizeUsage({
  prompt_tokens: 1000,
  prompt_cache_hit_tokens: 870,
  prompt_cache_miss_tokens: 130,
}), {
  promptTokens: 1000,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 870,
  cacheMissTokens: 130,
  reasoningTokens: undefined,
});

check('OpenAI：cached_tokens 从 prompt 里减出 miss', normalizeUsage({
  prompt_tokens: 1000,
  prompt_tokens_details: { cached_tokens: 870 },
}), {
  promptTokens: 1000,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 870,
  cacheMissTokens: 130,
  reasoningTokens: undefined,
});

check('OpenAI cached_tokens=0 是「没命中」，不是「不支持缓存」', normalizeUsage({
  prompt_tokens: 1000,
  prompt_tokens_details: { cached_tokens: 0 },
}), {
  promptTokens: 1000,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 1000,
  reasoningTokens: undefined,
});

check('Anthropic：cache_read_input_tokens', normalizeUsage({
  prompt_tokens: 500,
  cache_read_input_tokens: 200,
}), {
  promptTokens: 500,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 200,
  cacheMissTokens: 300,
  reasoningTokens: undefined,
});

check('思考 token：completion_tokens_details.reasoning_tokens', normalizeUsage({
  prompt_tokens: 10,
  completion_tokens: 50,
  completion_tokens_details: { reasoning_tokens: 33 },
}), {
  promptTokens: 10,
  completionTokens: 50,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  reasoningTokens: 33,
});

// ---- 字数按码点 ----
check('中文逐字计', countChars('你好'), 2);
check('emoji 只算 1 个（.length 会算 2）', countChars('👍'), 1);
check('混合：a👍你', countChars('a👍你'), 3);
check('空值安全', [countChars(undefined), countChars(null), countChars('')], [0, 0, 0]);

if (failed > 0) {
  console.error(`\nFAIL: ${failed} case(s) failed`);
  process.exit(1);
}
console.log('\nPASS: usage 字段映射与字数统计都对。');
