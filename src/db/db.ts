import Dexie, { Table } from 'dexie';
import { Session, Model, Folder } from '../types';

export interface Tombstone {
  id: string;
  type: 'session' | 'folder' | 'model';
  deletedAt: string;
}

class TreeChatDatabase extends Dexie {
  sessions!: Table<Session, string>;
  models!: Table<Model, string>;
  folders!: Table<Folder, string>;
  syncSnapshots!: Table<{ id: string; createdAt: string; data: string }, string>;
  tombstones!: Table<Tombstone, string>;

  constructor() {
    super('TreeChatDatabase');
    this.version(1).stores({
      sessions: 'id, title, createdAt, updatedAt',
      models: 'id, name'
    });
    // v2：新增文件夹表。Dexie 会保留 v1 已有的表，只补这一张。
    // 不写迁移是因为旧的 session 没有 folderId，读出来就是 undefined = 未分类。
    this.version(2).stores({
      folders: 'id, name'
    });
    // v3：新增同步快照表，用于在拉取/覆写云端数据前保存本地备份以供撤销。
    this.version(3).stores({
      syncSnapshots: 'id, createdAt'
    });
    // v4：新增删除墓碑表，记录会话与文件夹的删除时间戳，防止多端同步时僵尸复活。
    this.version(4).stores({
      tombstones: 'id, deletedAt'
    });
  }

  async getAllSessions(): Promise<Session[]> {
    return this.sessions.toArray();
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async saveSession(session: Session): Promise<void> {
    await this.sessions.put(session);
  }

  async deleteSession(id: string): Promise<void> {
    await this.sessions.delete(id);
  }

  async searchSessions(query: string): Promise<Session[]> {
    return this.sessions
      .filter(session => 
        session.title.toLowerCase().includes(query.toLowerCase())
      )
      .toArray();
  }

  async getAllModels(): Promise<Model[]> {
    return this.models.toArray();
  }

  async saveModel(model: Model): Promise<void> {
    await this.models.put(model);
  }

  async deleteModel(id: string): Promise<void> {
    await this.models.delete(id);
  }

  async getModel(id: string): Promise<Model | undefined> {
    return this.models.get(id);
  }

  async getAllFolders(): Promise<Folder[]> {
    return this.folders.toArray();
  }

  async saveFolder(folder: Folder): Promise<void> {
    await this.folders.put(folder);
  }

  async deleteFolder(id: string): Promise<void> {
    await this.folders.delete(id);
  }

  async saveSyncSnapshot(id: string, data: string): Promise<void> {
    await this.syncSnapshots.put({
      id,
      createdAt: new Date().toISOString(),
      data
    });
  }

  async getSyncSnapshot(id: string): Promise<{ id: string; createdAt: string; data: string } | undefined> {
    return this.syncSnapshots.get(id);
  }

  async deleteSyncSnapshot(id: string): Promise<void> {
    await this.syncSnapshots.delete(id);
  }

  async recordTombstone(id: string, type: 'session' | 'folder' | 'model'): Promise<void> {
    await this.tombstones.put({
      id,
      type,
      deletedAt: new Date().toISOString(),
    });
  }

  async getAllTombstones(): Promise<Tombstone[]> {
    return this.tombstones.toArray();
  }

  async saveTombstones(items: Tombstone[]): Promise<void> {
    for (const item of items) {
      await this.tombstones.put(item);
    }
  }

  async removeTombstone(id: string): Promise<void> {
    await this.tombstones.delete(id);
  }

  async pruneTombstones(maxDays = 30): Promise<void> {
    const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString();
    await this.tombstones
      .filter(t => t.deletedAt < cutoff)
      .delete();
  }
}

const db = new TreeChatDatabase();
export default db;
