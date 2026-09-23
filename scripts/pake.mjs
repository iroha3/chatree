#!/usr/bin/env bun
/*
 * 桌面版打包入口（Pake）。一律用 bun 跑：
 *   bun scripts/pake.mjs                     # 完整打包（出 msi / dmg / deb 等）
 *   bun scripts/pake.mjs --iterative-build   # 本地快速构建（只出可执行文件）
 *   bun scripts/pake.mjs --json              # CI：机器可读输出
 *
 * 为什么要有这个脚本，而不是把参数直接写在 package.json 里：
 *   1. **版本号只有一个来源**（package.json 的 version），这里读出来传给
 *      `--app-version`，不再在 pake.config.json 里手写第二份；
 *   2. Pake 的 `--icon` 必须是**平台对应格式**（win=.ico / linux=.png / mac=.icns），
 *      写死在配置里最多只能对上一个平台，其余平台 Pake 会**警告并回退成它自带的
 *      默认图标**（不会报错，很容易漏掉）。所以按 process.platform 选。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const ICON_BY_PLATFORM = {
  win32: 'build/icon.ico', // 需要 256×256
  darwin: 'build/icon.icns',
  linux: 'build/icon-512.png', // 需要 512×512
};

const icon = ICON_BY_PLATFORM[process.platform];
if (!icon) {
  console.error(`✗ 不支持的平台: ${process.platform}`);
  process.exit(1);
}

const args = [
  'x',
  '-y',
  'pake-cli@3.17.1',
  '--config',
  'pake.config.json',
  '--app-version',
  pkg.version,
  '--icon',
  icon,
  ...process.argv.slice(2),
];

console.log(`> bun ${args.join(' ')}`);

// --json 时 Pake 把日志写 stderr、把一行 JSON 结果写 stdout（含 outputs 产物列表）。
// 安装包本身落在 npx 缓存里（路径带哈希，不稳定），所以这里把清单落成文件，
// 再由 scripts/collect-artifacts.mjs 拷到 release/ 给 CI 收集。
const wantJson = args.includes('--json');
const result = spawnSync('bun', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: wantJson ? ['inherit', 'pipe', 'inherit'] : 'inherit',
});

if (wantJson) {
  const out = result.stdout ?? '';
  process.stdout.write(out);
  let parsed = null;
  for (const line of out.trim().split('\n').reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      parsed = JSON.parse(trimmed);
      break;
    } catch {
      /* 继续往前找 */
    }
  }
  if (parsed) {
    writeFileSync(path.join(root, 'pake-artifacts.json'), JSON.stringify(parsed, null, 2));
    const outputs = Array.isArray(parsed.outputs) ? parsed.outputs : [];
    console.log(`✓ 产物清单已写入 pake-artifacts.json（${outputs.length} 项）`);
    for (const o of outputs) console.log(`  - ${o.format ?? '?'}: ${o.path}`);
    if (parsed.ok === false) {
      console.error(`✗ Pake 构建失败: ${parsed.error?.message ?? 'unknown'}`);
      process.exit(1);
    }
  }
}

process.exit(result.status ?? 1);
