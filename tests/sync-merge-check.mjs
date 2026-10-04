/**
 * syncMerge 回归：墓碑 / 模型幂等。
 *
 * `mergeBidirectional` 直接依赖 Dexie + zustand，纯 bun 跑不动 —— 这里用
 * `mock.module` 把它俩换成内存实现（只实现 syncMerge 真正用到的方法），
 * 就能在不碰浏览器的情况下测真实的合并算法。
 *
 * 重点覆盖两件踩过的事：
 *   1. 模型也要认墓碑（否则 A 端删了、B 端又推回来，僵尸复活）；
 *   2. 「强推 → 同步」必须幂等。不勾「同步模型 API Key」时导出会删掉
 *      Authorization 等敏感头，合并绝不能把这当成「用户删了这个头」而抹掉本地。
 */
import { mock } from 'bun:test';

const sessions = new Map();
const folders = new Map();
const models = new Map();
let tombstones = [];

const fakeDb = {
  pruneTombstones: async () => {},
  getAllSessions: async () => [...sessions.values()],
  getAllFolders: async () => [...folders.values()],
  getAllModels: async () => [...models.values()],
  getAllTombstones: async () => [...tombstones],
  deleteSession: async (id) => void sessions.delete(id),
  deleteFolder: async (id) => void folders.delete(id),
  deleteModel: async (id) => void models.delete(id),
  saveSession: async (s) => void sessions.set(s.id, s),
  saveFolder: async (f) => void folders.set(f.id, f),
  saveModel: async (m) => void models.set(m.id, m),
  saveTombstones: async (items) => { tombstones = [...items]; },
  tombstones: { clear: async () => { tombstones = []; } },
};

mock.module('../src/db/db', () => ({ default: fakeDb }));
mock.module('../src/stores/sessionStore', () => ({
  useSessionStore: { getState: () => ({ setSessions: () => {}, setFolders: () => {}, setCurrentSessionId: () => {}, currentSessionId: null }) },
}));
mock.module('../src/stores/modelStore', () => ({
  useModelStore: { getState: () => ({ setModels: () => {} }) },
}));

const { mergeBidirectional } = await import('../src/utils/syncMerge');
const { buildExportFile } = await import('../src/utils/sessionTransfer');

let failed = 0;
function assert(cond, name) {
  if (cond) {
    console.log(`ok    ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}`);
  }
}

function model(id, extra = {}) {
  return {
    id,
    name: id,
    baseUrl: 'https://example.com',
    apiKey: `key-${id}`,
    modelName: `model-${id}`,
    defaultSystemPrompt: '',
    maxTokens: 4096,
    temperature: 1,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

// 墓碑有 30 天滑动窗口，测试日期必须用「相对现在」算，否则会被当过期墓碑过滤掉。
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

function cloudFile(payload, keepApiKeys) {
  return buildExportFile([], payload.models || [], [], {
    keepApiKeys,
    tombstones: payload.tombstones || [],
  });
}

function reset() {
  sessions.clear();
  folders.clear();
  models.clear();
  tombstones = [];
}

// ── 1. 模型墓碑：A 端删掉、B 端不得复活 ───────────────────────────
async function caseModelTombstone() {
  reset();
  const deleted = model('m-deleted');
  const kept = model('m-kept', { sortOrder: 1 });
  models.set('m-kept', kept);
  const cloud = cloudFile(
    {
      models: [deleted, kept],
      tombstones: [{ id: 'm-deleted', type: 'model', deletedAt: daysAgo(1) }],
    },
    true
  );
  const { stats, mergedFile } = await mergeBidirectional(cloud, { syncApiKeys: true });
  assert(stats.modelsDeleted === 1, '墓碑命中：sync 删掉 1 个模型');
  assert(!models.has('m-deleted'), '墓碑命中：被删模型不再落地本地');
  assert(models.has('m-kept'), '墓碑命中：无关模型照常保留');
  assert(!(mergedFile.models || []).some((m) => m.id === 'm-deleted'), '墓碑命中：回推云端也不含被删模型');
}

// ── 2. 强推 → 同步 幂等（不勾同步 Key，且带敏感自定义头）────────
async function caseForcePushIdempotent() {
  reset();
  const local = model('m-proxy', {
    customHeaders: { Authorization: 'Bearer secret', 'X-Conversation-Id': '{{sessionId}}' },
    customBody: { thinking_mode: true },
  });
  models.set('m-proxy', local);
  const before = JSON.parse(JSON.stringify([...models.values()]));

  // 模拟 forcePush：keepApiKeys=false，敏感头会被脱敏后上传
  const cloud = cloudFile({ models: [local] }, false);
  const uploaded = (cloud.models || [])[0];
  assert(!uploaded.customHeaders?.Authorization, '脱敏导出确实不含 Authorization');

  // 模拟紧接着按「同步」
  await mergeBidirectional(cloud, { syncApiKeys: false });
  const after = JSON.parse(JSON.stringify([...models.values()]));
  assert(JSON.stringify(after) === JSON.stringify(before), '强推后同步：本地模型零变化（敏感头不被抹掉）');
}

// ── 3. 删了又导入：createdAt 刷新后不被旧墓碑杀掉 ─────────────────
async function caseReimportRevives() {
  reset();
  const revived = model('m-revived', { createdAt: daysAgo(0) });
  models.set('m-revived', revived);
  const cloud = cloudFile(
    {
      models: [revived],
      tombstones: [{ id: 'm-revived', type: 'model', deletedAt: daysAgo(5) }],
    },
    true
  );
  const { stats } = await mergeBidirectional(cloud, { syncApiKeys: true });
  assert(stats.modelsDeleted === 0, '重新导入（createdAt 更新）：不被旧墓碑删掉');
  assert(models.has('m-revived'), '重新导入：模型保留');
}

// ── 4. 删除 → 强推 → 同步：云端若还带着已删模型，本地墓碑必须杀掉它 ──
// （模拟强推的 PUT 没生效 / 云端被别的端改过：本地已无该模型，但云端有）
async function caseLocalTombstoneKillsStaleCloudModel() {
  reset();
  // 本地只留 m-keep，m-gone 已删（仅剩墓碑）
  models.set('m-keep', model('m-keep', { sortOrder: 1 }));
  tombstones = [{ id: 'm-gone', type: 'model', deletedAt: daysAgo(0) }];
  // 云端却仍带着 m-gone（旧数据，无 createdAt）
  const stale = model('m-gone');
  delete stale.createdAt;
  const cloud = cloudFile({ models: [stale, model('m-keep', { sortOrder: 1 })], tombstones: [] }, true);
  const { stats } = await mergeBidirectional(cloud, { syncApiKeys: true });
  assert(stats.modelsDeleted === 1, '本地墓碑：云端带回来的已删模型被再次删掉');
  assert(!models.has('m-gone'), '本地墓碑：已删模型不会重新落地');
}

// ── 5. 模型 LWW：本地编辑过（清空提示词），云端陈旧时不得被冲回 ──
async function caseModelLwwKeepsNewerLocal() {
  reset();
  const local = model('m-p', { defaultSystemPrompt: '', updatedAt: daysAgo(0) });
  models.set('m-p', local);
  const staleRemote = model('m-p', { defaultSystemPrompt: '旧提示词', updatedAt: daysAgo(1) });
  const cloud = cloudFile({ models: [staleRemote] }, true);
  await mergeBidirectional(cloud, { syncApiKeys: true });
  assert(models.get('m-p').defaultSystemPrompt === '', '本地较新：清空的提示词不被陈旧的云端冲回');

  // 真正更旧的云端（模拟「强推后读到陈旧的 force push 前副本的新 updatedAt」不该赢）
  reset();
  const l2 = model('m-p2', { defaultSystemPrompt: '本地清空', updatedAt: daysAgo(0) });
  models.set('m-p2', l2);
  const older = model('m-p2', { defaultSystemPrompt: '旧', updatedAt: daysAgo(3) });
  await mergeBidirectional(cloudFile({ models: [older] }, true), { syncApiKeys: true });
  assert(models.get('m-p2').defaultSystemPrompt === '本地清空', '本地较新：更旧的云端不覆盖');
}

// ── 6. 模型 LWW：远端确实更新，则本地被覆盖（真同步仍生效）─────────
async function caseModelLwwRemoteWins() {
  reset();
  const local = model('m-n', { defaultSystemPrompt: '旧', updatedAt: daysAgo(2) });
  models.set('m-n', local);
  const newer = model('m-n', { defaultSystemPrompt: '新', updatedAt: daysAgo(0) });
  await mergeBidirectional(cloudFile({ models: [newer] }, true), { syncApiKeys: true });
  assert(models.get('m-n').defaultSystemPrompt === '新', '远端较新：本地被覆盖（同步仍生效）');
}

await caseModelTombstone();
await caseForcePushIdempotent();
await caseReimportRevives();
await caseLocalTombstoneKillsStaleCloudModel();
await caseModelLwwKeepsNewerLocal();
await caseModelLwwRemoteWins();

if (failed > 0) {
  console.error(`\n❌ syncMerge 回归失败：${failed} 项`);
  process.exit(1);
}
console.log('\n✅ 模型墓碑 / 强推幂等 全部通过。');
