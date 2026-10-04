/*
 * gzip 传输层回归（纯逻辑，不需要浏览器）。
 * WebDAV 同步文件现在以 gzip 字节存放，合并前必须先无损解回来 —— 这里守住这件事。
 */
import { gzipText, gunzipToText, isGzip, supportsGzip } from '../src/utils/compress.ts';

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const roundTrip = async (label, text) => {
  const bytes = await gzipText(text);
  const back = await gunzipToText(bytes);
  check(`${label}：解压后与原文逐字节一致`, back === text, `${text.length} 字 → ${bytes.length} 字节`);
  return bytes;
};

async function main() {
  check('运行环境支持 CompressionStream', supportsGzip() === true);

  // 1. 魔数嗅探
  const gz = await gzipText('{"hello":"world"}');
  const plain = new TextEncoder().encode('{"hello":"world"}');
  check('gzip 字节被识别为 gzip', isGzip(gz) === true, `前两字节 ${gz[0].toString(16)} ${gz[1].toString(16)}`);
  check('明文 JSON 不被误判为 gzip', isGzip(plain) === false);

  // 2. 各种内容无损往返
  await roundTrip('空串', '');
  await roundTrip('纯英文', 'The quick brown fox jumps over the lazy dog.');
  await roundTrip('中文 + emoji', '你好，世界 🌳 这是一段中文内容。');
  await roundTrip('JSON 结构', JSON.stringify({ format: 'treeai-sessions', version: 1, sessions: [{ id: 'x', nodes: [] }] }));

  // 3. 真实量级：20 条带正文/思维链的对话，验证「能压」且「能还原」
  const nodes = [];
  for (let i = 0; i < 20; i++) {
    nodes.push({
      id: `n-${i}`, parentId: i ? `n-${i - 1}` : null, type: 'chat',
      userMessage: `第 ${i} 个问题`.repeat(6),
      assistantMessage: `这是第 ${i} 条回答，`.repeat(80),
      reasoning: `这是第 ${i} 段思维链，`.repeat(120),
      modelId: 'm', temperature: 0.7, maxTokens: 8192, createdAt: '2026-10-04T02:00:00.000Z',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, cacheHitTokens: 0, cacheMissTokens: 1 },
      position: { x: 1.5, y: 2.5 },
    });
  }
  const big = JSON.stringify({ format: 'treeai-sessions', version: 1, exportedAt: 'x', sessions: [{ id: 's', title: 't', createdAt: 'x', updatedAt: 'x', nodes }] });
  const bigGz = await roundTrip('20 条对话', big);
  check('大文件确实变小了', bigGz.length < big.length, `${(big.length / 1024).toFixed(1)} KB → ${(bigGz.length / 1024).toFixed(1)} KB`);

  // 4. 坏数据必须抛错（调用方据此在写本地前中止，绝不合并坏数据）
  let threw = false;
  try {
    await gunzipToText(new TextEncoder().encode('this is not gzip'));
  } catch {
    threw = true;
  }
  check('非 gzip 输入解压会抛错', threw === true);

  if (results.every(Boolean)) {
    console.log('\n✅ gzip 压缩 / 解压往返全部通过。');
  } else {
    console.error('\n❌ gzip 回归失败。');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ 测试异常:', err);
  process.exit(1);
});
