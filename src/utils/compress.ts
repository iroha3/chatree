/**
 * 极简 gzip 工具：只依赖浏览器原生的 CompressionStream / DecompressionStream，
 * 不引入任何第三方压缩库。
 *
 * 用途：WebDAV 同步文件（几百 KB 的 JSON）在传输前压成 gzip 字节，
 * 自然语言正文一般能压到原来的 1/5 左右。纯传输层编码，
 * 同步合并逻辑（墓碑、双向 merge）完全无感。
 */

/** gzip 文件头魔数：0x1f 0x8b。 */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** 运行环境是否支持原生压缩（现代浏览器 / WebView2 均支持）。 */
export function supportsGzip(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/**
 * 把字符串压成 gzip 字节。
 * 环境不支持时**原样返回 UTF-8 字节**（调用方靠 isGzip 嗅探，读回时按明文解析）。
 */
export async function gzipText(text: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(text);
  if (!supportsGzip()) return input;

  const compressed = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

/**
 * 解压 gzip 字节为字符串。
 * 输入不是合法 gzip（损坏 / 被服务端改写）时抛错，由调用方转成用户可读的报错，
 * 从而在写本地数据之前就中止同步 —— 绝不能把坏数据合并进 IndexedDB。
 */
export async function gunzipToText(bytes: Uint8Array): Promise<string> {
  const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(decompressed).text();
}
