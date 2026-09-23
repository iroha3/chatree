import { t } from '../i18n';

/**
 * 会话标题工具。
 *
 * 默认标题放在这里而不是写死在组件里，是为了让「新建会话」和
 * 「自动命名」两处引用同一个值 —— 否则改了一边，自动命名会认为
 * 标题已被用户手动改过，从此再也不生效。
 */

/** i18n 词典里的 key（中文原文）。 */
const DEFAULT_TITLE_KEY = '新会话';

/**
 * 历史上出现过的默认标题。
 *
 * 标题是**落库的数据**：用户在中文界面建的会话存的是「新会话」，
 * 英文界面建的是「New Conversation」，旧版本一律写死英文。
 * 自动命名要判断「标题还是不是默认的」，就得把这些都认出来，
 * 否则切换语言后自动命名会失效。
 */
const KNOWN_DEFAULT_TITLES = ['新会话', 'New Conversation'];

/** 当前语言下的默认标题（新建会话时用）。 */
export function defaultSessionTitle(): string {
  return t(DEFAULT_TITLE_KEY);
}

/** 标题是否仍是「默认标题」——自动命名只在这种情况下才覆盖。 */
export function isDefaultSessionTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  return KNOWN_DEFAULT_TITLES.includes(title);
}

/** 自动标题的最大长度（按字符数，中文也算 1 个） */
export const AUTO_TITLE_MAX_LENGTH = 24;

/**
 * 从第一个问题推导会话标题。纯本地字符串处理，不调用 API。
 * 返回 null 表示没有可用内容（例如空白输入），调用方应保持原标题。
 */
export function deriveSessionTitle(text: string | undefined | null): string | null {
  if (!text) return null;

  // 换行/多余空格压成单个空格，避免标题里带换行把侧边栏撑开
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  return clean.length > AUTO_TITLE_MAX_LENGTH
    ? `${clean.slice(0, AUTO_TITLE_MAX_LENGTH)}…`
    : clean;
}
