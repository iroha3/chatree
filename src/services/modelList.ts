/**
 * 拉取 OpenAI 兼容端点的模型列表：`GET {baseUrl}/models`。
 *
 * ⚠️ 这是**锦上添花**的能力，不是必需流程，调用方必须按「可能永远失败」处理：
 *   - 很多服务商根本没实现 `/models`（404 / 403）；
 *   - `/chat/completions` 能跨域不代表 `/models` 也放了 CORS 头；
 *   - 桌面版（`tauri.localhost`）与浏览器的跨域表现还可能不一样。
 * 所以失败一律静默，回退到手动填写，绝不因为它挡住用户保存模型。
 *
 * 端点和 chat 的推导保持一致（chat 是 `{baseUrl}/chat/completions`），
 * 所以 baseUrl 该带 `/v1` 就带 `/v1`（OpenAI），不带也行（DeepSeek、LM Studio）。
 *
 * 解析刻意宽松：标准是 `{ data: [{ id }] }`，也有 `{ models: [...] }` 或纯字符串数组。
 */
export async function fetchModelIds(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/models`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    signal,
  });
  if (!res.ok) {
    throw new Error(`Model list request failed: ${res.status}`);
  }

  const json: unknown = await res.json();
  const raw =
    (json as { data?: unknown } | null)?.data ??
    (json as { models?: unknown } | null)?.models ??
    json;

  if (!Array.isArray(raw)) return [];

  const ids = raw
    .map(item =>
      typeof item === 'string' ? item : (item as { id?: unknown } | null)?.id
    )
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  // 去重 + 排序：有的兼容层会返回重复项，顺序也乱
  return Array.from(new Set(ids)).sort();
}
