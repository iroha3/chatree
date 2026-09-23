#!/usr/bin/env bun
/*
 * 把桌面版产物收集到 release/，并**统一命名**，供 CI 上传。
 *
 * 为什么需要这个脚本：
 *
 *   1. Pake 的安装包留在 npx 缓存里（路径带哈希，不稳定）；keepBinary 会把原始
 *      可执行文件拷到仓库根。scripts/pake.mjs 在 --json 模式下把产物清单写进
 *      pake-artifacts.json，这里读它 + 检查根目录的原始二进制，统一拷到 release/。
 *
 *   2. **Pake 给安装包起的是裸名**（`Chatree.msi` / `chatree.deb` / `Chatree-binary`），
 *      跨平台/跨架构会重名。第一次跑 CI 就踩到了：linux x64 和 linux arm64 都产出
 *      `chatree.deb`，合并进同一个 Release 时会互相覆盖（arm64 的那个直接消失）。
 *      所以这里一律重命名成 `Chatree-<版本>-<平台>-<架构>[.扩展名]`。
 *
 * 平台/架构从环境变量读（CI 里由矩阵传）：
 *   CHATREE_PLATFORM=windows CHATREE_ARCH=x64 bun scripts/collect-artifacts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const platform = process.env.CHATREE_PLATFORM ?? process.platform;
const arch = process.env.CHATREE_ARCH ?? process.arch;

const outDir = path.join(root, 'release');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

/** 待收集的源文件，按绝对路径去重（Pake 的 outputs 里已经含原始二进制）。 */
const sources = [];
const addSource = (p) => {
  if (!p) return;
  const resolved = path.resolve(p);
  if (!sources.includes(resolved)) sources.push(resolved);
};

const resultPath = path.join(root, 'pake-artifacts.json');
if (fs.existsSync(resultPath)) {
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  for (const output of result.outputs ?? []) addSource(output?.path);
} else {
  console.warn('⚠ 没找到 pake-artifacts.json（请用 bun run desktop:build:ci 构建）');
}

// keepBinary 的落点：Windows 是 Chatree.exe，其他平台是 Chatree-binary。
for (const name of ['Chatree.exe', 'Chatree-binary']) {
  const candidate = path.join(root, name);
  if (fs.existsSync(candidate)) addSource(candidate);
}

let copied = 0;
for (const src of sources) {
  if (!fs.existsSync(src)) continue;
  const ext = path.extname(src);
  let dest = `Chatree-${version}-${platform}-${arch}${ext}`;
  // 同扩展名撞车（比如将来 Windows 上同时给 msi 安装器和便携 exe）时加序号，
  // 宁可名字丑一点，也不能让其中一个把另一个覆盖掉。
  for (let i = 2; fs.existsSync(path.join(outDir, dest)); i++) {
    dest = `Chatree-${version}-${platform}-${arch}-${i}${ext}`;
  }
  fs.copyFileSync(src, path.join(outDir, dest));
  const mb = (fs.statSync(src).size / 1024 / 1024).toFixed(1);
  console.log(`  + ${dest}  (${mb} MB)`);
  copied++;
}

if (copied === 0) {
  console.error('✗ 没有收集到任何产物');
  process.exit(1);
}
console.log(`✓ 已收集 ${copied} 个产物到 release/`);
