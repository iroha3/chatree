import db, { Tombstone } from '../db/db';
import { Session, Model, Folder } from '../types';
import { SessionExportFile, buildExportFile, parseExportFile } from './sessionTransfer';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';

const SNAPSHOT_KEY = 'pre-sync-latest';

export interface MergeStats {
  sessionsAdded: number;
  sessionsUpdated: number;
  sessionsDeleted: number;
  sessionsKept: number;
  foldersAdded: number;
  foldersDeleted: number;
  modelsAdded: number;
  modelsUpdated: number;
}

/**
 * 在执行任何同步、拉取或覆盖之前，保存当前本地完整快照。
 * 保存在 Dexie IndexedDB 中，不受 localStorage 5MB 限制，包含 API Key 与墓碑。
 */
export async function savePreSyncSnapshot(): Promise<void> {
  const sessions = await db.getAllSessions();
  const models = await db.getAllModels();
  const folders = await db.getAllFolders();
  const tombstones = await db.getAllTombstones();

  const file = buildExportFile(sessions, models, folders, {
    keepApiKeys: true,
    tombstones,
  });
  await db.saveSyncSnapshot(SNAPSHOT_KEY, JSON.stringify(file));
}

/**
 * 检查是否存在可撤销的同步前本地快照
 */
export async function hasPreSyncSnapshot(): Promise<boolean> {
  const record = await db.getSyncSnapshot(SNAPSHOT_KEY);
  return !!record;
}

/**
 * 撤销上一次同步，将本地数据还原至同步前的快照状态
 */
export async function restorePreSyncSnapshot(): Promise<{
  success: boolean;
  message: string;
}> {
  const record = await db.getSyncSnapshot(SNAPSHOT_KEY);
  if (!record) {
    return { success: false, message: '未找到可撤销的同步快照' };
  }

  const parsed = parseExportFile(record.data);
  if ('error' in parsed) {
    return { success: false, message: `快照解析失败: ${parsed.error}` };
  }

  const { sessions, folders, models, tombstones } = parsed.data;

  // 清空现有数据并完全恢复快照
  await db.sessions.clear();
  await db.folders.clear();
  await db.tombstones.clear();

  for (const s of sessions) {
    await db.saveSession(s);
  }
  for (const f of folders) {
    await db.saveFolder(f);
  }
  for (const m of models) {
    await db.saveModel(m);
  }
  if (tombstones && tombstones.length > 0) {
    await db.saveTombstones(tombstones);
  }

  // 同步更新 Zustand 内存状态
  const allSessions = await db.getAllSessions();
  const allFolders = await db.getAllFolders();
  const allModels = await db.getAllModels();

  useSessionStore.getState().setSessions(allSessions);
  useSessionStore.getState().setFolders(allFolders);
  useModelStore.getState().setModels(allModels);

  // 恢复后删除该快照（单次撤销机制，避免反复回滚）
  await db.deleteSyncSnapshot(SNAPSHOT_KEY);

  return {
    success: true,
    message: `已成功撤销同步，恢复至快照（共 ${sessions.length} 个会话）`
  };
}

/**
 * 带墓碑机制的双向闭环合并算法：
 * 1. 汇总双端的删除墓碑（清理超过 30 天的过期记录）；
 * 2. 对比会话修改时间与删除时间：
 *    - 若会话 updatedAt <= deletedAt，执行删除，绝不复活；
 *    - 若会话 updatedAt > deletedAt，说明删除后该会话又被编辑聊过，保留并移除对应墓碑；
 *    - 共有会话按 updatedAt 取最新版本；
 * 3. 文件夹与模型配置安全合并（本地有效 API Key 绝不丢失）；
 * 4. 本地落库后生成最终一致性的 SessionExportFile，准备推回云端，完成闭环。
 */
export async function mergeBidirectional(
  incoming: SessionExportFile,
  options: { syncApiKeys?: boolean } = {}
): Promise<{
  mergedFile: SessionExportFile;
  stats: MergeStats;
}> {
  // 先清理本地超过 30 天的陈旧墓碑
  await db.pruneTombstones(30);

  const localSessions = await db.getAllSessions();
  const localFolders = await db.getAllFolders();
  const localModels = await db.getAllModels();
  const localTombstones = await db.getAllTombstones();

  const incomingTombstones = incoming.tombstones || [];

  // 1. 合并双端墓碑表，取最新的删除时间
  const tombstoneMap = new Map<string, Tombstone>();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const t of [...localTombstones, ...incomingTombstones]) {
    if (t.deletedAt < thirtyDaysAgo) continue; // 过滤超期墓碑
    const existing = tombstoneMap.get(t.id);
    if (!existing || new Date(t.deletedAt).getTime() > new Date(existing.deletedAt).getTime()) {
      tombstoneMap.set(t.id, t);
    }
  }

  const stats: MergeStats = {
    sessionsAdded: 0,
    sessionsUpdated: 0,
    sessionsDeleted: 0,
    sessionsKept: 0,
    foldersAdded: 0,
    foldersDeleted: 0,
    modelsAdded: 0,
    modelsUpdated: 0,
  };

  // 2. 双向合并会话
  const sessionCandidates = new Map<string, Session>();
  const localSessionMap = new Map(localSessions.map(s => [s.id, s]));

  // 先把本地会话放入候选池
  for (const s of localSessions) {
    sessionCandidates.set(s.id, s);
  }

  // 对比远端会话
  for (const remoteSession of incoming.sessions) {
    const local = sessionCandidates.get(remoteSession.id);
    if (!local) {
      sessionCandidates.set(remoteSession.id, remoteSession);
      stats.sessionsAdded++;
    } else {
      const remoteTime = new Date(remoteSession.updatedAt).getTime();
      const localTime = new Date(local.updatedAt).getTime();

      if (remoteTime > localTime) {
        sessionCandidates.set(remoteSession.id, remoteSession);
        stats.sessionsUpdated++;
      } else {
        stats.sessionsKept++;
      }
    }
  }

  // 根据墓碑过滤已删除的会话
  const finalSessions: Session[] = [];
  const sessionsToDeleteLocally: string[] = [];

  for (const [id, session] of sessionCandidates.entries()) {
    const tombstone = tombstoneMap.get(id);
    if (tombstone) {
      const sessionTime = new Date(session.updatedAt).getTime();
      const deletedTime = new Date(tombstone.deletedAt).getTime();

      if (deletedTime >= sessionTime) {
        // 该会话已在某端被删除，且删除后未再次编辑：确认删除，绝不复活！
        stats.sessionsDeleted++;
        if (localSessionMap.has(id)) {
          sessionsToDeleteLocally.push(id);
        }
        continue;
      } else {
        // 会话在删除后又被编辑聊过：保留它，并销毁该墓碑
        tombstoneMap.delete(id);
      }
    }
    finalSessions.push(session);
  }

  // 3. 双向合并文件夹
  const folderCandidates = new Map<string, Folder>();
  const localFolderMap = new Map(localFolders.map(f => [f.id, f]));

  for (const f of localFolders) {
    folderCandidates.set(f.id, f);
  }
  if (incoming.folders) {
    for (const f of incoming.folders) {
      if (!folderCandidates.has(f.id)) {
        folderCandidates.set(f.id, f);
        stats.foldersAdded++;
      }
    }
  }

  const finalFolders: Folder[] = [];
  const foldersToDeleteLocally: string[] = [];

  for (const [id, folder] of folderCandidates.entries()) {
    const tombstone = tombstoneMap.get(id);
    if (tombstone) {
      const folderTime = new Date(folder.createdAt).getTime();
      const deletedTime = new Date(tombstone.deletedAt).getTime();
      if (deletedTime >= folderTime) {
        stats.foldersDeleted++;
        if (localFolderMap.has(id)) {
          foldersToDeleteLocally.push(id);
        }
        continue;
      } else {
        tombstoneMap.delete(id);
      }
    }
    finalFolders.push(folder);
  }

  // 4. 双向合并模型配置
  const localModelMap = new Map(localModels.map(m => [m.id, m]));
  const finalModelMap = new Map<string, Model>();

  for (const m of localModels) {
    finalModelMap.set(m.id, m);
  }

  if (incoming.models) {
    for (const remoteModel of incoming.models) {
      const local = localModelMap.get(remoteModel.id);
      if (!local) {
        finalModelMap.set(remoteModel.id, remoteModel);
        stats.modelsAdded++;
      } else {
        // 本地有效 key 永远优先保留；远端若带有效 key 且本地为空则补充
        const effectiveApiKey = local.apiKey || remoteModel.apiKey || '';
        const mergedModel: Model = {
          ...remoteModel,
          apiKey: effectiveApiKey,
          sortOrder: local.sortOrder ?? remoteModel.sortOrder,
        };
        finalModelMap.set(remoteModel.id, mergedModel);
        stats.modelsUpdated++;
      }
    }
  }

  const finalModels = Array.from(finalModelMap.values());
  const finalTombstones = Array.from(tombstoneMap.values());

  // 5. 写入本地 IndexedDB
  // (1) 删除本地命中了墓碑的旧数据
  for (const id of sessionsToDeleteLocally) {
    await db.deleteSession(id);
  }
  for (const id of foldersToDeleteLocally) {
    await db.deleteFolder(id);
  }

  // (2) 保存保留和新增的会话/文件夹/模型
  for (const s of finalSessions) {
    await db.saveSession(s);
  }
  for (const f of finalFolders) {
    await db.saveFolder(f);
  }
  for (const m of finalModels) {
    await db.saveModel(m);
  }

  // (3) 保存更新后的墓碑表
  await db.tombstones.clear();
  await db.saveTombstones(finalTombstones);

  // 6. 刷新内存 Zustand store
  const allSessions = await db.getAllSessions();
  const allFolders = await db.getAllFolders();
  const allModels = await db.getAllModels();

  useSessionStore.getState().setSessions(allSessions);
  useSessionStore.getState().setFolders(allFolders);
  useModelStore.getState().setModels(allModels);

  // 7. 生成对齐后的全量导出对象，包含墓碑，用于回推云端
  const mergedFile = buildExportFile(allSessions, allModels, allFolders, {
    keepApiKeys: options.syncApiKeys ?? true,
    tombstones: finalTombstones,
  });

  return {
    mergedFile,
    stats,
  };
}

/**
 * 镜像覆盖模式：完全以云端为准重置本地
 */
export async function overwriteWithRemoteData(incoming: SessionExportFile): Promise<{
  sessionsCount: number;
  foldersCount: number;
}> {
  const localModels = await db.getAllModels();
  const localModelMap = new Map(localModels.map(m => [m.id, m]));

  // 清空旧数据
  await db.sessions.clear();
  await db.folders.clear();
  await db.tombstones.clear();

  // 写入会话
  for (const session of incoming.sessions) {
    await db.saveSession(session);
  }

  // 写入文件夹
  if (incoming.folders) {
    for (const folder of incoming.folders) {
      await db.saveFolder(folder);
    }
  }

  // 写入墓碑
  if (incoming.tombstones && incoming.tombstones.length > 0) {
    await db.saveTombstones(incoming.tombstones);
  }

  // 写入模型（保留本地有效 API Key）
  if (incoming.models) {
    for (const remoteModel of incoming.models) {
      const local = localModelMap.get(remoteModel.id);
      const effectiveApiKey = (local && local.apiKey) || remoteModel.apiKey || '';
      await db.saveModel({
        ...remoteModel,
        apiKey: effectiveApiKey,
      });
    }
  }

  // 刷新内存 store
  const allSessions = await db.getAllSessions();
  const allFolders = await db.getAllFolders();
  const allModels = await db.getAllModels();

  useSessionStore.getState().setSessions(allSessions);
  useSessionStore.getState().setFolders(allFolders);
  useModelStore.getState().setModels(allModels);

  const currentSessionId = useSessionStore.getState().currentSessionId;
  if (!allSessions.some(s => s.id === currentSessionId)) {
    useSessionStore.getState().setCurrentSessionId(allSessions.length > 0 ? allSessions[0].id : null);
  }

  return {
    sessionsCount: incoming.sessions.length,
    foldersCount: incoming.folders?.length || 0,
  };
}
