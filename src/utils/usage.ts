import type { UsageStats } from '../types';

/**
 * 服务商返回的 usage 原始对象。
 *
 * 字段名各家不一样，而且**都是可选的** —— 这里只做归一化，不做任何估算：
 * 数字一律原样透传服务端给的 token 数。这一点是刻意的：token 数只有服务商的
 * 分词器说了算，本地用字符数除以 4 之类的「估算」只会骗人。
 */
export interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** DeepSeek */
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  /** Anthropic / 部分兼容层 */
  cache_read_input_tokens?: number;
  /** OpenAI */
  prompt_tokens_details?: { cached_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
}

/**
 * 把各家五花八门的 usage 字段收敛成 UsageStats。
 *
 * - **promptTokens** 是「本次请求的**全部**输入 token」，包含系统提示词和整条历史，
 *   不是最后那句用户消息。输入只有「你好」也可能显示几十个 token，原因就在这里
 *   （chat 模板本身、历史消息、缓存字段都会算进去）。
 * - 缓存命中：DeepSeek `prompt_cache_hit_tokens` / OpenAI `prompt_tokens_details.cached_tokens`
 *   / Anthropic `cache_read_input_tokens`，认得的都认。
 * - 未命中：DeepSeek 直接给；其他家只能自己减。判空方式要小心 —— OpenAI 报
 *   `cached_tokens: 0` 是有意义的（缓存在用、这次没命中），要照常算出 100% 未命中，
 *   而不是当作「这家不支持缓存」。
 */
export function normalizeUsage(u: RawUsage): UsageStats {
  const promptTokens = u.prompt_tokens ?? 0;

  const cacheHitTokens =
    u.prompt_cache_hit_tokens ??
    u.prompt_tokens_details?.cached_tokens ??
    u.cache_read_input_tokens ??
    0;

  const reportsCache =
    cacheHitTokens > 0 ||
    u.prompt_tokens_details != null ||
    u.prompt_cache_miss_tokens != null ||
    u.cache_read_input_tokens != null;

  const cacheMissTokens =
    u.prompt_cache_miss_tokens ?? (reportsCache ? Math.max(promptTokens - cacheHitTokens, 0) : 0);

  return {
    promptTokens,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
    cacheHitTokens,
    cacheMissTokens,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
  };
}
