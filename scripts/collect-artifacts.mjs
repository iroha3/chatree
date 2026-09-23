#!/usr/bin/env bun
/*
 * 把桌面版产物收集到 release/ 目录，供 CI 上传。
 *
 * 为什么需要：Pake 的安装包（msi/dmg/deb/AppImage）留在 npx 缓存里，路径带哈希、
 * 不稳定；而 keepBinary 会把原始可执行文件拷到仓库根。scripts/pake.mjs 在 --json
 * 模式下把产物清单写进 pake-artifacts.json，这里读它 + 检查根目录原始二进制，
 * 统一拷到 release/。
 *
 * 用法：bun scripts/collect-artifacts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'release');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let copied = 0;
const copy = (src, destName) => {
  if (!src || !fs.existsSync(src)) return;
  fs.copyFileSync(src, path.join(outDir, destName));
  console.log(`  + ${destName}`);
  copied++;
};

const resultPath = path.join(root, 'pake-artifacts.json');
if (fs.existsSync(resultPath)) {
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  for (const output of result.outputs ?? []) {
    if (output?.path) copy(output.path, path.basename(output.path));
  }
} else {
  console.warn('⚠ 没找到 pake-artifacts.json（请用 bun run desktop:build:ci 构建）');
}

// keepBinary 把原始可执行文件拷到仓库根：Windows 是 Chatree.exe，其他平台是 Chatree-binary。
for (const name of ['Chatree.exe', 'Chatree-binary']) {
  copy(path.join(root, name), name);
}

if (copied === 0) {
  console.error('✗ 没有收集到任何产物');
  process.exit(1);
}
console.log(`✓ 已收集 ${copied} 个产物到 release/`);
