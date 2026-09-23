/*
 * 从 public/favicon.svg 生成三平台图标。
 *
 * 为什么不用 sharp / ImageMagick：
 *   - 项目不想为了「一次性生成图标」多引一个带原生二进制的依赖；
 *   - 机器上一定有 Edge，干脆用它的 headless 截图把 SVG 栅格化。
 *
 * 产出（都在 build/，会被提交，因为打桌面版时要用）：
 *   build/icon.ico       多尺寸 ICO（16/32/48/64/128/256），Windows 用
 *   build/icon-512.png   512×512 PNG，Linux 用（Pake 要求正好 512）
 *   build/icon.icns      macOS 用（内嵌 128/256/512/1024 的 PNG）
 *
 * ⚠️ Pake 的 --icon 只认**平台对应格式**（win=.ico / linux=.png / mac=.icns），
 *    格式不对它会警告并回退成自带默认图标，不报错。详见 scripts/pake.mjs。
 *
 * 这是**一次性**步骤（图标很少变），产物已提交，CI 不需要跑它。
 * 用法：bun scripts/make-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const outDir = path.join(root, 'build');
fs.mkdirSync(outDir, { recursive: true });

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!edge) {
  console.error('找不到 Edge，请用 EDGE_PATH 指定 msedge.exe 的路径');
  process.exit(1);
}

// 注意：**不能用 `width:100vw/100vh`**。
// 实测在 96–160px 这个区间，100vw 会让 Edge headless 截出一张全透明的空图
// （80 / 192 / 256 又没问题，很妖）。把尺寸写成固定 px 就稳定了。
function htmlFor(size) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svg}</body></html>`;
}

function render(size, outName) {
  const out = path.join(outDir, outName);
  for (let attempt = 0; attempt < 3; attempt++) {
    fs.rmSync(out, { force: true });
    // 每次都用独立的 profile：共用一个目录时，后一次启动可能被上一次的
    // 残留进程接管，截出一张空图。
    const profile = path.join(os.tmpdir(), `chatree-icon-${process.pid}-${size}-${attempt}`);
    const htmlPath = path.join(os.tmpdir(), `chatree-icon-${process.pid}-${size}.html`);
    fs.writeFileSync(htmlPath, htmlFor(size));
    try {
      execFileSync(edge, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--user-data-dir=${profile}`,
        `--window-size=${size},${size}`,
        `--screenshot=${out}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
      ], { stdio: 'ignore' });
    } catch { /* 重试 */ } finally {
      fs.rmSync(profile, { recursive: true, force: true });
      fs.rmSync(htmlPath, { force: true });
    }
    if (fs.existsSync(out) && !isBlankPng(out)) return out;
  }
  throw new Error(`渲染 ${size}px 图标失败（连续 3 次得到空图）`);
}

/** 截图偶发全透明：把 IDAT 解开看是不是只有一种字节。 */
function isBlankPng(file) {
  const buf = fs.readFileSync(file);
  let offset = 8;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(buf.slice(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const first = raw[0];
  return raw.every((b) => b === first);
}

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const pngs = ICO_SIZES.map((s) => ({ size: s, buf: fs.readFileSync(render(s, `icon-${s}.png`)) }));
fs.copyFileSync(render(512, 'icon-512.png'), path.join(outDir, 'icon-512.png'));

// ── 手工拼 ICO ──────────────────────────────────────────────
// Vista 之后 ICO 允许直接内嵌 PNG，比 BMP 简单得多（不用管调色板/掩码）。
// ICONDIR:  reserved(2) type(2)=1 count(2)
// ENTRY:    w(1) h(1) colors(1) reserved(1) planes(2) bitcount(2) bytes(4) offset(4)
//           w/h 为 0 表示 256
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);

const entries = [];
let offset = 6 + 16 * pngs.length;
for (const { size, buf } of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2); // 调色板数
  e.writeUInt8(0, 3); // 保留
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += buf.length;
}

fs.writeFileSync(
  path.join(outDir, 'icon.ico'),
  Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]),
);

// ── 手工拼 ICNS（macOS） ────────────────────────────────
// 结构比 ICO 还简单：magic "icns" + 总长度(BE)，然后每个条目是
//   OSType(4) + 条目长度(BE，含这 8 字节头) + 数据
// 现代 macOS 接受直接内嵌 PNG。这里放 128/256/512/1024（ic07–ic10），
// 小尺寸由系统自己缩。
const ICNS_ENTRIES = [
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 },
];
const icnsParts = ICNS_ENTRIES.map(({ type, size }) => {
  const buf = fs.readFileSync(render(size, `icon-${size}.png`));
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(buf.length + 8, 4);
  return Buffer.concat([head, buf]);
});
const icnsBody = Buffer.concat(icnsParts);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 'ascii');
icnsHeader.writeUInt32BE(8 + icnsBody.length, 4);
fs.writeFileSync(path.join(outDir, 'icon.icns'), Buffer.concat([icnsHeader, icnsBody]));

console.log(
  `✓ build/icon.ico (${ICO_SIZES.join('/')}) + build/icon-512.png + build/icon.icns (${ICNS_ENTRIES.map((e) => e.size).join('/')})`,
);
