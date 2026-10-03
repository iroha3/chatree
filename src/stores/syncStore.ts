import { create } from 'zustand';
import {
  WebDavConfig,
  testConnection as apiTestConnection,
  getFileMeta,
  uploadSyncData,
  downloadSyncData
} from '../services/webdav';
import {
  savePreSyncSnapshot,
  hasPreSyncSnapshot,
  restorePreSyncSnapshot,
  mergeBidirectional,
  overwriteWithRemoteData,
  MergeStats
} from '../utils/syncMerge';
import { buildExportFile, SessionExportFile } from '../utils/sessionTransfer';
import db from '../db/db';

const CONFIG_STORAGE_KEY = 'chatree-webdav-config';
const META_STORAGE_KEY = 'chatree-webdav-meta';

interface SyncMeta {
  lastSyncTime: string | null;
  lastRemoteETag: string | null;
  lastRemoteModified: string | null;
}

const DEFAULT_CONFIG: WebDavConfig = {
  serverUrl: '',
  username: '',
  password: '',
  syncPath: 'chatree-sync.json',
  syncApiKeys: true,
};

function loadStoredConfig(): WebDavConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // 忽略解析错误
  }
  return DEFAULT_CONFIG;
}

function loadStoredMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // 忽略解析错误
  }
  return {
    lastSyncTime: null,
    lastRemoteETag: null,
    lastRemoteModified: null,
  };
}

function saveMeta(meta: SyncMeta) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // 忽略写入错误
  }
}

export interface SyncActionResult {
  success: boolean;
  message: string;
  stats?: MergeStats;
}

interface SyncState {
  config: WebDavConfig;
  isTesting: boolean;
  testResult: { ok: boolean; message: string; suggestedUrl?: string } | null;
  isSyncing: boolean;
  syncAction: 'sync' | 'push' | 'pull' | 'check' | null;
  lastSyncTime: string | null;
  lastRemoteETag: string | null;
  lastRemoteModified: string | null;
  hasRemoteUpdate: boolean;
  hasBackup: boolean;

  setConfig: (partial: Partial<WebDavConfig>) => void;
  testConnection: () => Promise<boolean>;
  /**
   * 一键双向同步（拉取 -> 带墓碑双向合并 -> 写入本地 -> 推送最新结果回云端）
   */
  sync: () => Promise<SyncActionResult>;
  /**
   * 高级操作：强制推送本地所有数据覆盖云端
   */
  forcePush: () => Promise<SyncActionResult>;
  /**
   * 高级操作：完全从云端镜像覆盖本地
   */
  forcePull: () => Promise<SyncActionResult>;
  /**
   * 撤销上一次同步，还原本地快照
   */
  restoreBackup: () => Promise<{ success: boolean; message: string }>;
  checkRemoteUpdate: () => Promise<boolean>;
  init: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  config: loadStoredConfig(),
  isTesting: false,
  testResult: null,
  isSyncing: false,
  syncAction: null,
  ...loadStoredMeta(),
  hasRemoteUpdate: false,
  hasBackup: false,

  setConfig: (partial) => {
    set((state) => {
      const nextConfig = { ...state.config, ...partial };
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch {
        // 忽略写入错误
      }
      return { config: nextConfig, testResult: null };
    });
  },

  testConnection: async () => {
    const { config } = get();
    set({ isTesting: true, testResult: null });
    try {
      const result = await apiTestConnection(config);
      set({ isTesting: false, testResult: result });
      return result.ok;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isTesting: false, testResult: { ok: false, message: msg } });
      return false;
    }
  },

  sync: async () => {
    const { config } = get();
    if (!config.serverUrl.trim()) {
      return { success: false, message: '请先配置 WebDAV 服务器地址' };
    }

    set({ isSyncing: true, syncAction: 'sync' });

    try {
      // 1. 同步前自动保存本地完整快照，提供撤销后悔药
      await savePreSyncSnapshot();
      set({ hasBackup: true });

      // 2. 从云端拉取已有数据
      const downloadResult = await downloadSyncData(config);

      let mergedFile: SessionExportFile;
      let summaryMessage = '';
      let statsObj: MergeStats | undefined;

      if (!downloadResult.ok) {
        // 如果是首次同步（云端文件 404 不存在），直接推送本地数据
        if (downloadResult.error?.includes('尚未找到备份文件') || downloadResult.error?.includes('404')) {
          const sessions = await db.getAllSessions();
          const models = await db.getAllModels();
          const folders = await db.getAllFolders();
          const tombstones = await db.getAllTombstones();

          mergedFile = buildExportFile(sessions, models, folders, {
            keepApiKeys: config.syncApiKeys,
            tombstones,
          });
          summaryMessage = `首次同步：已将本地 ${sessions.length} 个会话上传至云端`;
        } else {
          set({ isSyncing: false, syncAction: null });
          return { success: false, message: downloadResult.error || '无法读取云端数据' };
        }
      } else {
        // 3. 执行带墓碑的双向闭环合并
        const { mergedFile: merged, stats } = await mergeBidirectional(downloadResult.data!, {
          syncApiKeys: config.syncApiKeys,
        });
        mergedFile = merged;
        statsObj = stats;

        const details: string[] = [];
        if (stats.sessionsAdded > 0) details.push(`新增 ${stats.sessionsAdded} 个会话`);
        if (stats.sessionsUpdated > 0) details.push(`更新 ${stats.sessionsUpdated} 个会话`);
        if (stats.sessionsDeleted > 0) details.push(`同步删除 ${stats.sessionsDeleted} 个会话`);
        if (stats.foldersAdded > 0) details.push(`新建 ${stats.foldersAdded} 个文件夹`);
        if (stats.foldersDeleted > 0) details.push(`同步删除 ${stats.foldersDeleted} 个文件夹`);
        if (stats.modelsAdded > 0) details.push(`导入 ${stats.modelsAdded} 个模型配置`);

        summaryMessage = details.length > 0 ? `同步完成：${details.join('，')}` : '同步完成：双端数据完全一致';
      }

      // 4. 将合并后的最终一致性数据推回云端，保证闭环
      const uploadResult = await uploadSyncData(config, mergedFile);
      if (!uploadResult.ok) {
        set({ isSyncing: false, syncAction: null });
        return { success: false, message: `本地合并已完成，但推回云端失败: ${uploadResult.error}` };
      }

      const now = new Date().toISOString();
      const nextMeta: SyncMeta = {
        lastSyncTime: now,
        lastRemoteETag: uploadResult.etag || null,
        lastRemoteModified: now,
      };

      saveMeta(nextMeta);
      set({
        isSyncing: false,
        syncAction: null,
        ...nextMeta,
        hasRemoteUpdate: false,
      });

      return {
        success: true,
        message: summaryMessage,
        stats: statsObj,
      };
    } catch (err: unknown) {
      set({ isSyncing: false, syncAction: null });
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `同步异常: ${msg}` };
    }
  },

  forcePush: async () => {
    const { config } = get();
    if (!config.serverUrl.trim()) {
      return { success: false, message: '请先配置 WebDAV 服务器地址' };
    }

    set({ isSyncing: true, syncAction: 'push' });

    try {
      const sessions = await db.getAllSessions();
      const models = await db.getAllModels();
      const folders = await db.getAllFolders();
      const tombstones = await db.getAllTombstones();

      const exportFile = buildExportFile(sessions, models, folders, {
        keepApiKeys: config.syncApiKeys,
        tombstones,
      });

      const uploadResult = await uploadSyncData(config, exportFile);
      if (!uploadResult.ok) {
        set({ isSyncing: false, syncAction: null });
        return { success: false, message: uploadResult.error || '上传失败' };
      }

      const now = new Date().toISOString();
      const nextMeta: SyncMeta = {
        lastSyncTime: now,
        lastRemoteETag: uploadResult.etag || null,
        lastRemoteModified: now,
      };

      saveMeta(nextMeta);
      set({
        isSyncing: false,
        syncAction: null,
        ...nextMeta,
        hasRemoteUpdate: false,
      });

      return {
        success: true,
        message: `已强制推送覆盖云端（${sessions.length} 个会话）`
      };
    } catch (err: unknown) {
      set({ isSyncing: false, syncAction: null });
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  },

  forcePull: async () => {
    const { config } = get();
    if (!config.serverUrl.trim()) {
      return { success: false, message: '请先配置 WebDAV 服务器地址' };
    }

    set({ isSyncing: true, syncAction: 'pull' });

    try {
      await savePreSyncSnapshot();
      set({ hasBackup: true });

      const downloadResult = await downloadSyncData(config);
      if (!downloadResult.ok || !downloadResult.data) {
        set({ isSyncing: false, syncAction: null });
        return { success: false, message: downloadResult.error || '下载失败' };
      }

      const res = await overwriteWithRemoteData(downloadResult.data);
      const now = new Date().toISOString();
      const nextMeta: SyncMeta = {
        lastSyncTime: now,
        lastRemoteETag: downloadResult.etag || null,
        lastRemoteModified: downloadResult.lastModified || now,
      };

      saveMeta(nextMeta);
      set({
        isSyncing: false,
        syncAction: null,
        ...nextMeta,
        hasRemoteUpdate: false,
      });

      return {
        success: true,
        message: `已完全以云端镜像重置本地（共 ${res.sessionsCount} 个会话）`
      };
    } catch (err: unknown) {
      set({ isSyncing: false, syncAction: null });
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  },

  restoreBackup: async () => {
    try {
      const result = await restorePreSyncSnapshot();
      if (result.success) {
        set({ hasBackup: false });
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `撤销失败: ${msg}` };
    }
  },

  checkRemoteUpdate: async () => {
    const { config, lastSyncTime, lastRemoteETag } = get();
    if (!config.serverUrl.trim()) return false;

    try {
      const meta = await getFileMeta(config);
      if (meta.exists) {
        let isNewer = false;
        if (meta.lastModified && lastSyncTime) {
          isNewer = new Date(meta.lastModified).getTime() > new Date(lastSyncTime).getTime();
        } else if (meta.etag && lastRemoteETag) {
          isNewer = meta.etag !== lastRemoteETag;
        } else if (!lastSyncTime) {
          isNewer = true;
        }

        set({ hasRemoteUpdate: isNewer });
        return isNewer;
      }
    } catch {
      // 忽略后台检测异常
    }
    return false;
  },

  init: async () => {
    const hasSnap = await hasPreSyncSnapshot();
    set({ hasBackup: hasSnap });
  }
}));
