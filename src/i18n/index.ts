import { useMemo } from 'react';
import { create } from 'zustand';

/**
 * 极简 i18n。
 *
 * 只支持中文 / 英文两套，而且**直接用中文原文当 key**：
 *   - 词典只维护 zh → en 一张表；
 *   - 漏翻的条目会原样回退成中文，不会在界面上出现 `model.settings.title`
 *     这种 key。所以可以放心地一条一条补，不用一次性全改完。
 *   - 需要变量时用 `{name}` 占位。
 *
 * 组件里用 `useT()`（语言一变就重渲染）；非组件环境（store / notification）
 * 直接用导出的 `t()`。
 */

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'treeai-lang';

/** 窗口标题。index.html 里的 <title> 是同一句中文，两边保持一致。 */
export const APP_TITLE_ZH = 'Chatree - 让每个念头都能分叉';

/** zh → en。key 是界面上的中文原文。 */
const en: Record<string, string> = {
  // ── 通用 ──────────────────────────────────────────────
  设置: 'Settings',
  关闭: 'Close',
  取消: 'Cancel',
  保存: 'Save',
  重命名: 'Rename',
  删除: 'Delete',
  添加: 'Add',
  模型: 'Model',
  温度: 'Temperature',
  最大令牌数: 'Max tokens',
  重试: 'Retry',
  默认: 'Default',
  全部: 'All',
  未分类: 'Uncategorized',
  创建: 'Created',
  更新: 'Updated',
  最近对话: 'Last message',
  复制到剪贴板: 'Copy to clipboard',
  模型设置: 'Model settings',
  删除节点: 'Delete node',
  添加子节点: 'Add child node',
  需先生成回答: 'Wait for reply before branching',
  重新生成分支: 'Regenerate branch',
  停止生成: 'Stop',
  展开阅读: 'Expand reader',
  复制: 'Copy',
  已复制: 'Copied',

  // ── App ───────────────────────────────────────────────
  'Chatree - 让每个念头都能分叉': 'Chatree - Branch every line of thought',
  '加载中...': 'Loading...',
  '欢迎使用 Chatree': 'Welcome to Chatree',
  '创建新会话，开始探索树状分支对话。':
    'Create a session to explore branching conversations.',
  配置模型: 'Configure model',
  新建会话: 'New session',
  新会话: 'New Conversation',

  // ── Sidebar ───────────────────────────────────────────
  会话名称已更新: 'Session renamed',
  会话名称不能为空: 'Session name cannot be empty',
  会话已删除: 'Session deleted',
  '已创建文件夹「{name}」': 'Folder "{name}" created',
  文件夹已重命名: 'Folder renamed',
  '删除文件夹「{name}」？\n其中的会话将移至「未分类」，不会被删除。':
    'Delete folder "{name}"?\nIts sessions will move to "Uncategorized" and will not be deleted.',
  '文件夹已删除，会话已移至「未分类」': 'Folder deleted — sessions moved to "Uncategorized"',
  '搜索标题或内容...': 'Search titles or content...',
  清除搜索: 'Clear search',
  显示全部会话: 'Show all sessions',
  只看收藏: 'Starred only',
  删除文件夹: 'Delete folder',
  文件夹名: 'Folder name',
  新建文件夹: 'New folder',
  '新建文件夹…': 'New folder…',
  没有匹配的会话: 'No matching sessions',
  还没有收藏的会话: 'No starred sessions yet',
  这个文件夹还是空的: 'This folder is empty',
  暂无会话: 'No sessions yet',
  取消收藏: 'Unstar',
  收藏: 'Star',
  收藏会话: 'Star session',
  确定: 'Confirm',
  移动到文件夹: 'Move to folder',
  移动到: 'Move to',
  拖拽会话可归类至文件夹: 'Drag sessions to folders to categorize',
  切换到日间模式: 'Switch to light mode',
  切换到夜间模式: 'Switch to dark mode',

  // ── ChatNode ──────────────────────────────────────────
  对话节点: 'Chat node',
  节点已删除: 'Node deleted',
  消息已保存: 'Message saved',
  '输入消息...': 'Type a message...',
  '点击输入消息...': 'Click to enter message...',
  '思考中...': 'Thinking...',
  '思考过程': 'Reasoning',
  '思考过程 · {n} 字': 'Reasoning · {n} chars',
  '思考中…': 'Thinking…',
  停止: 'Stop',
  阅读: 'Read',
  '{n} 轮': '{n} turn(s)',
  '这条路径没有内容': 'This path is empty',
  '（空）': '(empty)',
  '分支 {i}/{n}': 'Branch {i}/{n}',
  选择分支继续: 'Continue from branch',
  向下滚动阅读下一轮: 'Scroll down for next turn',
  '确定删除该节点？': 'Delete this node?',
  '确定删除该节点？将连带删除其 {n} 个子节点。': 'Delete this node? Its {n} descendant(s) will be deleted.',
  已删除节点: 'Node deleted',
  '已删除节点及 {n} 个子节点': 'Node and {n} descendant(s) deleted',
  撤销: 'Undo',
  '请求失败，可重试': 'Request failed — you can retry',
  回答将显示在这里: 'Response will appear here',
  '{n} 字': '{n} chars',
  输出速度: 'Speed',
  '命中缓存 {hit} tok，未命中 {miss} tok': 'cache hit {hit} tok, miss {miss} tok',
  '缓存 {n}%': 'Cache {n}%',
  '↑ 输入 Token（含上下文）· ↓ 输出 Token':
    '↑ Input tokens (with context) · ↓ Output tokens',
  '思考 Token': 'Reasoning tokens',
  '思考 {n} tok': 'Thinking {n} tok',
  发送: 'Send',

  // ── SystemNode ────────────────────────────────────────
  系统提示词: 'System prompt',
  '输入系统提示词...': 'Enter system prompt...',
  '点击输入系统提示词...': 'Click to enter system prompt...',
  点击编辑系统提示词: 'Click to edit system prompt',

  // ── ChatFlow ──────────────────────────────────────────
  '当前模型不存在，请重新选择': "Current model not found, please select another",
  '已创建新分支，正在生成…': 'New branch created, generating…',
  '已切换至 {name}（系统提示词已更新）': 'Switched to {name} (system prompt updated)',
  '已切换至模型 {name}': 'Switched to model: {name}',
  导出成功: 'Exported',
  '导出失败: {msg}': 'Export failed: {msg}',
  会话已导出: 'Session exported',
  会话统计: 'Session stats',
  分享与导出: 'Share & export',
  'JSON 备份': 'JSON Backup',
  '思维导图 (.mm)': 'Mind map (.mm)',
  重新排布节点: 'Re-layout nodes',

  // ── SessionStats ──────────────────────────────────────
  节点: 'Nodes',
  提问: 'Questions',
  回答: 'Answers',
  分支: 'Branches',
  分支点: 'Branch points',
  同一父节点下的后续衍生分支: 'Subsequent sibling branches',
  产生分支的节点数量: 'Nodes with multiple branches',
  '↑ 输入 Token': '↑ Input tokens',
  '累计输入 Token（含系统提示词与上下文）': 'Total input tokens (system prompt + history)',
  '↓ 输出 Token': '↓ Output tokens',
  '累计输出 Token': 'Total output tokens generated',
  缓存命中: 'Cache hit',
  计费次数: 'Billed calls',
  '产生 Token 消耗的回答数': 'Answers with token usage',
  回答字数: 'Answer characters',

  // ── Settings ──────────────────────────────────────────
  数据: 'Data',
  外观: 'Appearance',
  关于: 'About',
  语言: 'Language',
  主题: 'Theme',
  浅色: 'Light',
  深色: 'Dark',
  画布网格: 'Canvas Grid',
  无网格: 'None',
  点状网格: 'Dots',
  命中: 'Match',

  // ── ModelsPanel ───────────────────────────────────────
  '确定要删除这个模型吗？': 'Delete this model?',
  删除模型: 'Delete model',
  模型列表: 'Models',
  暂无配置模型: 'No models configured',
  模型名称: 'Name',
  'API 地址': 'API base URL',
  'API 密钥': 'API key',
  '模型标识（Model ID）': 'Model ID',
  '思考强度（Reasoning Effort）': 'Reasoning effort',
  '拖拽可调整排序，首位模型为新建会话的默认项。':
    'Drag to reorder; the first model is used by default for new conversations.',
  默认系统提示词: 'Default system prompt',
  '（可留空）': '(optional)',
  '留空则不发送 system 消息': 'If empty, no system message is sent',
  默认温度: 'Default temperature',
  默认最大令牌数: 'Default max tokens',
  '单次最大生成 Token（256–{max}）': 'Max tokens per reply (256–{max})',
  保存模型: 'Save model',
  模型配置: 'Model settings',
  '从左侧选择模型编辑，或添加新模型。':
    'Select a model on the left to edit, or add a new one.',
  添加模型: 'Add model',

  // ── DataPanel ─────────────────────────────────────────
  暂无可导出的会话: 'No sessions to export yet',
  '已导出 {n} 个会话': 'Exported {n} sessions',
  读取文件失败: 'Failed to read the file',
  '导入失败：{msg}': 'Import failed: {msg}',
  '没有新增内容：{n} 个会话均已存在': 'Nothing new: all {n} sessions already exist',
  文件中无有效内容: 'No importable content in this file',
  '新增 {n} 个会话': '{n} sessions added',
  '跳过 {n} 个已存在会话': '{n} existing skipped',
  '新建 {n} 个文件夹': '{n} folders created',
  '导入 {n} 个模型配置（需补充 API Key）': '{n} model configs imported (API keys required)',
  '导入完成：{parts}': 'Import complete: {parts}',
  当前数据: 'Current data',
  '数据仅保存在当前浏览器的 IndexedDB 中，不会上传至任何服务器。':
    'Data is stored locally in IndexedDB and never uploaded.',
  会话: 'Sessions',
  文件夹: 'Folders',
  备份: 'Backup',
  '将全部会话、文件夹及模型配置导出为一个 JSON 文件。':
    'Export all sessions, folders, and model configs into a single JSON file.',
  导出完整备份: 'Export backup',
  恢复: 'Restore',
  '导入备份文件以恢复数据。新数据将自动导入，已存在的项目自动跳过。':
    'Import a backup file to restore. New items will be imported; existing items are skipped.',
  '注：出于安全考虑，备份文件不包含 API Key，导入后需重新填写。':
    'Note: For security, backup files do not contain API keys and must be re-entered.',
  导入备份: 'Import backup',
  '如需导出单个会话，可在画布右上角选择「分享与导出 → JSON 备份」。格式与此处通用。':
    'To export a single session, select "Share & Export → JSON Backup" on the canvas. Both formats are compatible.',

  // ── AboutPanel ────────────────────────────────────────
  核心特性: 'Key Features',
  数据与隐私: 'Data & privacy',
  项目链接: 'Links',
  项目源码: 'Project source',
  上游项目: 'Upstream project',
  '面向分支思考的本地优先对话画布。支持从任意节点分叉探索，并排对比不同思路与模型输出。':
    'A local-first visual canvas for branching thoughts and comparing LLM responses.',
  '树状分支探索：支持从任意节点分叉并排对比':
    'Tree branching: branch from any node and compare side by side',
  '模型广泛兼容：支持 DeepSeek、OpenAI、Ollama 等兼容接口':
    'Broad model compatibility: DeepSeek, OpenAI, Ollama, and OpenAI-compatible APIs',
  '深度推理支持：实时展示思考链并支持调节推理强度':
    'Reasoning support: live chain-of-thought with configurable effort',
  '用量与缓存统计：记录 Token 消耗与上下文缓存命中率':
    'Usage & cache: track token usage and context cache hits',
  '本地优先架构：数据仅留存于浏览器 IndexedDB，离线安全':
    'Local-first: data stays inside browser IndexedDB, completely offline and secure',
  '独立离线运行：无第三方 CDN 依赖，支持内网部署':
    'Fully offline: zero third-party CDN requests, intranet-ready',
  '灵活备份导入：支持全局完整备份与单会话独立导入导出':
    'Flexible backup: workspace backup and single-session import/export',
  '所有会话与配置均保存在本地浏览器内，清除浏览数据将导致记录丢失。建议定期备份；API Key 不会包含在备份中。':
    'All sessions and configs are stored locally. Clearing browser data will erase them. Back up regularly; API keys are excluded.',
  'Chatree 基于开源项目': 'Chatree is derived from the open-source project ',
  '（MIT 协议）二次开发与演进，感谢原作者奠定的优秀基础。':
    ' (MIT License); grateful to the original author.',
  '本项目采用 GNU AGPLv3 协议开源，完整保留上游版权声明与提交历史。':
    'Chatree is licensed under GNU AGPLv3. Upstream copyright notice and commit history are preserved.',
  用: 'Built with ',
  构建: '',
  // 桌面端检查更新（AboutPanel）
  '检查更新中…': 'Checking for updates…',
  发现新版本: 'New version available',
  去下载: 'Download',
  已是最新版本: 'Up to date',
  检查更新: 'Check for updates',
  重新检查: 'Check again',
  用系统浏览器打开下载页: 'Open the download page in your system browser',

  // ── reasoningEffort ───────────────────────────────────
  '默认（服务端缺省）': 'Default (server default)',
  '关闭 (none)': 'Off (none)',
  '低 (low)': 'Low (low)',
  '高 (high)': 'High (high)',
  '最高 (max)': 'Max (max)',

  // ── sessionTransfer ───────────────────────────────────
  '无效的 JSON 文件': 'Invalid JSON file',
  '文件格式错误（根结构无效）': 'Invalid file structure',
  '非 Chatree 备份文件': 'Not a Chatree backup file',
  '文件缺少版本信息': 'Missing version information',
  '文件版本 (v{v}) 高于当前应用版本 (最高支持 v{max})，请更新后导入':
    'File version (v{v}) is newer than app (max supported v{max}); please update first',
  '文件中未包含会话数据': 'No sessions found in file',
  '未包含有效会话': 'No valid sessions in file',

  // ── modelStore ────────────────────────────────────────
  模型创建成功: 'Model created',
  '模型创建失败: {msg}': 'Failed to create model: {msg}',
  模型更新成功: 'Model updated',
  '模型更新失败：{msg}': 'Failed to update model: {msg}',
  模型已删除: 'Model deleted',
  '模型删除失败: {msg}': 'Failed to delete model: {msg}',
  '调整顺序失败: {msg}': 'Failed to reorder: {msg}',

  // ── 思考强度说明（跟着档位变） ────────────────────────
  '不显式传参，使用服务端默认设置。':
    'Do not send reasoning_effort; use server defaults.',
  '关闭思考，响应最快且消耗最少 Token。':
    'Disable reasoning; fastest and lowest token cost.',
  '较少思考，平衡响应速度与成本。':
    'Low reasoning effort; fast and cost-effective.',
  '深度思考，适合复杂推理与编程任务。':
    'High reasoning effort; best for complex logic and code.',
  '最大思考深度，适用于高难度复杂任务。':
    'Maximum reasoning effort; for demanding challenges.',

  // ── 没有模型时的空状态 ──────────────────────────────
  暂无可用模型: 'No models configured',
  '请先配置模型后再开始对话。': 'Please configure a model to start.',
};

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function readStoredLang(): Lang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'zh' || saved === 'en' ? saved : null;
  } catch {
    return null;
  }
}

function detectLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en';
}

export function applyLang(lang: Lang): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  // 浏览器标签页 / Pake 窗口的标题也跟着切。以前它是 index.html 里写死的英文，
  // 界面全中文了标题栏还是英文。
  document.title = lang === 'zh' ? APP_TITLE_ZH : en[APP_TITLE_ZH] ?? APP_TITLE_ZH;
}

const initialLang: Lang = readStoredLang() ?? detectLang();

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: initialLang,
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // 写不进去也无所谓，当前会话仍然生效
    }
    applyLang(lang);
    set({ lang });
  },
}));

/** 当前语言下的翻译（非组件环境用）。 */
export function t(zh: string, vars?: Record<string, string | number>): string {
  const { lang } = useLangStore.getState();
  return interpolate(lang === 'zh' ? zh : en[zh] ?? zh, vars);
}

/** 组件内用：语言切换会自动重渲染。 */
export function useT(): (zh: string, vars?: Record<string, string | number>) => string {
  const lang = useLangStore((s) => s.lang);
  return useMemo(
    () => (zh: string, vars?: Record<string, string | number>) =>
      interpolate(lang === 'zh' ? zh : en[zh] ?? zh, vars),
    [lang],
  );
}

applyLang(initialLang);
