/**
 * 桌面端「检查更新」。
 *
 * 定位是**半自动**：只负责发现新版本并给个链接，下载/替换由用户自己来。
 * 不做静默自动更新 —— 那需要 Tauri updater 插件 + 更新包签名 + CI，
 * 而 Pake 生成的项目并不带这些；这个 App 又是离线优先的，联网检查只是锦上添花。
 */

/** 发版的是本仓库（Chatree），不是上游 TreeAI。换仓库名时只改这一行。 */
const REPO = 'iroha3/chatree';
const RELEASES_URL = `https://github.com/${REPO}/releases`;

export interface UpdateInfo {
  current: string;
  latest: string;
  /** 新版本 release 页地址，点击后用系统浏览器打开。 */
  url: string;
}

/** 检查结果三态：有新版本 / 已是最新 / 没查成（离线、限流、网络被拦）。 */
export type UpdateCheck =
  | { status: 'available'; info: UpdateInfo }
  | { status: 'latest' }
  | { status: 'error' };

/**
 * 是否运行在桌面版（Pake/Tauri）里。
 *
 * Pake 打开了 `withGlobalTauri`，所以桌面端一定有 `window.__TAURI__`；
 * 普通浏览器里没有。网页版永远是最新的，不需要检查更新。
 */
export function isDesktopApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__)
  );
}

/** 把 "v1.2.3-beta.4" 这类字符串拆成数字数组，方便比较。 */
function parseVersion(version: string): number[] {
  return String(version)
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map(part => parseInt(part, 10) || 0);
}

/** 语义化比较：latest 比 current 新则返回 true。 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

interface GithubRelease {
  tag_name?: unknown;
  html_url?: unknown;
}

/**
 * 查最新 release。失败区分开：没连上（error）不能骗用户说「已是最新版本」。
 */
export async function checkForUpdate(current: string): Promise<UpdateCheck> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    // 404 = 这个仓库还没发过 release，对用户来说就是「没有新版本」。
    if (res.status === 404) return { status: 'latest' };
    if (!res.ok) return { status: 'error' };
    const data = (await res.json()) as GithubRelease;
    const tag = typeof data.tag_name === 'string' ? data.tag_name : '';
    if (!tag || !isNewerVersion(tag, current)) return { status: 'latest' };
    return {
      status: 'available',
      info: {
        current,
        latest: tag.replace(/^v/i, ''),
        url: typeof data.html_url === 'string' && data.html_url ? data.html_url : RELEASES_URL,
      },
    };
  } catch {
    return { status: 'error' };
  }
}
