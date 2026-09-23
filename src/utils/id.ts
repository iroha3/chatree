/**
 * 生成一个全局唯一 id。
 *
 * 优先用 `crypto.randomUUID()`，但它**只在安全上下文里存在**（https / localhost）。
 * 这个项目经常被部署在内网，通过 `http://192.168.x.x` 打开 —— 那种情况下
 * `crypto.randomUUID` 是 `undefined`，直接调用会让「新建会话 / 加节点 / 建模型」
 * 全部抛错。所以这里做两层回退：
 *
 *   1. `crypto.randomUUID()` —— 原生，最理想；
 *   2. `crypto.getRandomValues()` 自己拼一个 v4 UUID —— 局域网 http 下浏览器
 *      仍会提供这个 API；
 *   3. 时间戳 + 随机数 —— 连 getRandomValues 都没有的极端环境（很老的浏览器 /
 *      被裁剪的 WebView）。
 *
 * 回退项只在本机生成、从不发往服务端，碰撞概率足够低。
 */
export function generateId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      // 个别实现会抛（比如非安全上下文），落到下一层
    }
  }

  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // RFC 4122 version 4 / variant 10
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
