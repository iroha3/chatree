import { SessionExportFile, parseExportFile } from '../utils/sessionTransfer';

export interface WebDavConfig {
  serverUrl: string;
  username: string;
  password: string;
  syncPath: string;
  syncApiKeys: boolean;
}

export interface FileMeta {
  exists: boolean;
  etag?: string | null;
  lastModified?: string | null;
  size?: number | null;
}

/**
 * 规整并拼装 WebDAV 完整文件 URL。
 * 例如 serverUrl 为 http://192.168.31.9:5244/dav/，syncPath 为 chatree-sync.json
 * 结果为 http://192.168.31.9:5244/dav/chatree-sync.json
 */
export function resolveWebDavUrl(serverUrl: string, syncPath = 'chatree-sync.json'): string {
  let base = serverUrl.trim();
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) {
    base = 'http://' + base;
  }
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = (syncPath || 'chatree-sync.json').trim().replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * 生成包含 UTF-8 安全编码的 HTTP Basic Auth Header
 */
function getHeaders(config: WebDavConfig, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    ...extraHeaders,
  };
  if (config.username) {
    const rawCreds = `${config.username}:${config.password || ''}`;
    // 使用 encodeURIComponent 配合 unescape / utf-8 转换，避免中文字符导致 btoa 报错
    const base64Creds = btoa(
      encodeURIComponent(rawCreds).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
    headers['Authorization'] = `Basic ${base64Creds}`;
  }
  return headers;
}

/**
 * 测试 WebDAV 服务器的连通性与鉴权。
 * 如果检测到用户配置的是类似 AList 根路径且返回 404/405，会自动探测 /dav/ 并给出智能建议。
 */
export async function testConnection(config: WebDavConfig): Promise<{
  ok: boolean;
  message: string;
  suggestedUrl?: string;
}> {
  if (!config.serverUrl.trim()) {
    return { ok: false, message: '请输入 WebDAV 服务器地址' };
  }

  let targetUrl = config.serverUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'http://' + targetUrl;
  }
  if (!targetUrl.endsWith('/')) {
    targetUrl += '/';
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'PROPFIND',
      headers: getHeaders(config, { Depth: '0' }),
    });

    if (res.status === 200 || res.status === 207) {
      return { ok: true, message: '连接成功，WebDAV 服务可正常读写' };
    }
    if (res.status === 401) {
      return { ok: false, message: '认证失败（401）：用户名或密码不正确' };
    }
    if (res.status === 403) {
      return { ok: false, message: '无权限访问（403）：该账户可能无读写权限' };
    }

    // AList 常见场景：用户填了根路径 http://ip:5244/ 而没有加 /dav/
    if (!targetUrl.includes('/dav')) {
      try {
        const davUrl = targetUrl.replace(/\/+$/, '') + '/dav/';
        const davRes = await fetch(davUrl, {
          method: 'PROPFIND',
          headers: getHeaders(config, { Depth: '0' }),
        });
        if (davRes.status === 200 || davRes.status === 207 || davRes.status === 401) {
          return {
            ok: davRes.status !== 401,
            suggestedUrl: davUrl,
            message:
              davRes.status === 401
                ? '已自动识别为 AList，推荐路径为 /dav/，但用户名密码错误'
                : '连接成功！检测到 AList 服务，建议使用 /dav/ 路径'
          };
        }
      } catch {
        // 忽略探测失败
      }
    }

    return { ok: false, message: `服务器返回状态码: ${res.status} ${res.statusText}` };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      return {
        ok: false,
        message: '无法连通服务器，请检查地址、端口以及服务端 CORS（跨域）是否已开启'
      };
    }
    return { ok: false, message: errorMsg || '连接异常' };
  }
}

/**
 * 获取云端备份文件的元数据（是否存在、修改时间、ETag 等）
 */
export async function getFileMeta(config: WebDavConfig): Promise<FileMeta> {
  const fileUrl = resolveWebDavUrl(config.serverUrl, config.syncPath);
  if (!fileUrl) return { exists: false };

  try {
    // 优先使用轻量的 HEAD 请求
    const res = await fetch(fileUrl, {
      method: 'HEAD',
      headers: getHeaders(config),
    });

    if (res.status === 200) {
      return {
        exists: true,
        etag: res.headers.get('ETag'),
        lastModified: res.headers.get('Last-Modified'),
        size: res.headers.get('Content-Length') ? Number(res.headers.get('Content-Length')) : null,
      };
    }

    if (res.status === 404) {
      return { exists: false };
    }

    // 部分 WebDAV 对 HEAD 支持不佳时回退到 PROPFIND
    if (res.status === 405) {
      const propRes = await fetch(fileUrl, {
        method: 'PROPFIND',
        headers: getHeaders(config, { Depth: '0' }),
      });
      if (propRes.status === 200 || propRes.status === 207) {
        return {
          exists: true,
          etag: propRes.headers.get('ETag'),
          lastModified: propRes.headers.get('Last-Modified'),
        };
      }
      if (propRes.status === 404) {
        return { exists: false };
      }
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * 递归/顺序创建 WebDAV 目标父级目录 (MKCOL)
 */
async function ensureParentDirectory(config: WebDavConfig, fileUrl: string): Promise<boolean> {
  try {
    const urlObj = new URL(fileUrl);
    const segments = urlObj.pathname.split('/').filter(Boolean);
    if (segments.length <= 1) return true;
    segments.pop(); // 移除文件名，保留目录路径

    let current = '';
    for (const seg of segments) {
      current += '/' + seg;
      const colUrl = `${urlObj.origin}${current}/`;
      try {
        await fetch(colUrl, {
          method: 'MKCOL',
          headers: getHeaders(config),
        });
      } catch {
        // 忽略中间目录已存在的报错
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 上传同步文件到 WebDAV (PUT)
 */
export async function uploadSyncData(
  config: WebDavConfig,
  file: SessionExportFile
): Promise<{ ok: boolean; etag?: string | null; error?: string }> {
  const fileUrl = resolveWebDavUrl(config.serverUrl, config.syncPath);
  if (!fileUrl) {
    return { ok: false, error: 'WebDAV 地址未配置' };
  }

  try {
    const jsonString = JSON.stringify(file, null, 2);
    const res = await fetch(fileUrl, {
      method: 'PUT',
      headers: getHeaders(config, {
        'Content-Type': 'application/json; charset=utf-8',
      }),
      body: jsonString,
    });

    if (res.status === 200 || res.status === 201 || res.status === 204) {
      return {
        ok: true,
        etag: res.headers.get('ETag'),
      };
    }

    if (res.status === 401) {
      return { ok: false, error: '认证失败（401），请核对 WebDAV 用户名和密码' };
    }
    if (res.status === 403) {
      return { ok: false, error: '写入被拒绝（403），该目录可能无写入权限' };
    }
    if (res.status === 409) {
      // 目标父级目录不存在：自动通过 MKCOL 创建父级目录并重试
      const created = await ensureParentDirectory(config, fileUrl);
      if (created) {
        const retryRes = await fetch(fileUrl, {
          method: 'PUT',
          headers: getHeaders(config, {
            'Content-Type': 'application/json; charset=utf-8',
          }),
          body: jsonString,
        });
        if (retryRes.status === 200 || retryRes.status === 201 || retryRes.status === 204) {
          return { ok: true, etag: retryRes.headers.get('ETag') };
        }
      }
      return { ok: false, error: '目标父级文件夹不存在且自动创建失败（409），请核对路径' };
    }

    return { ok: false, error: `上传失败（HTTP ${res.status} ${res.statusText}）` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.includes('Failed to fetch') ? '网络请求失败，请检查网络或 CORS' : msg };
  }
}

/**
 * 从 WebDAV 下载同步数据文件 (GET) 并校验解析
 */
export async function downloadSyncData(config: WebDavConfig): Promise<{
  ok: boolean;
  data?: SessionExportFile;
  etag?: string | null;
  lastModified?: string | null;
  error?: string;
}> {
  const fileUrl = resolveWebDavUrl(config.serverUrl, config.syncPath);
  if (!fileUrl) {
    return { ok: false, error: 'WebDAV 地址未配置' };
  }

  try {
    const res = await fetch(fileUrl, {
      method: 'GET',
      headers: getHeaders(config),
    });

    if (res.status === 404) {
      return { ok: false, error: '云端尚未找到备份文件，请先在当前或其他设备执行「推送」' };
    }
    if (res.status === 401) {
      return { ok: false, error: '认证失败（401），请核对 WebDAV 用户名和密码' };
    }
    if (!res.ok) {
      return { ok: false, error: `下载失败（HTTP ${res.status} ${res.statusText}）` };
    }

    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';

    // 检测是否返回了网页 (HTML)，如 AList 根路径前端网页
    if (
      contentType.includes('text/html') ||
      text.trim().startsWith('<!DOCTYPE') ||
      text.trim().startsWith('<html')
    ) {
      return {
        ok: false,
        error:
          '云端返回了网页 (HTML) 而非数据文件。通常是因为 WebDAV 地址未包含正确的挂载路径（例如 AList 需在地址后包含 /dav/，如 http://...:5244/dav/）',
      };
    }

    const parsed = parseExportFile(text);
    if ('error' in parsed) {
      return { ok: false, error: `云端文件解析失败: ${parsed.error}` };
    }

    const etag = res.headers.get('ETag');
    const lastModified = res.headers.get('Last-Modified');

    return {
      ok: true,
      data: parsed.data as SessionExportFile,
      etag,
      lastModified,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.includes('Failed to fetch') ? '网络连接失败，请检查网络或 CORS' : msg };
  }
}
