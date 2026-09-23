import { create } from 'zustand';

export interface ConfirmOptions {
  /** 标题，可选。删除类操作建议写清「删什么」。 */
  title?: string;
  /** 正文。支持 \n 换行（渲染时用 whitespace-pre-line）。 */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作（删除等）：确认按钮变红，并带一个警示图标。 */
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  respond: (value: boolean) => void;
}

/**
 * 未决的 resolve。同一时刻只允许一个确认框。
 *
 * 放在模块作用域而不是 store 里：Promise 的 resolve 函数不是可序列化状态，
 * 没必要（也不适合）塞进 zustand 触发重渲染。
 */
let resolver: ((value: boolean) => void) | null = null;

export const useConfirmStore = create<ConfirmState>((set) => ({
  open: false,
  options: null,
  requestConfirm: (options) => {
    // 已经有确认框挂着时，先把旧的当「取消」结掉，避免 Promise 永远悬着。
    resolver?.(false);
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
      set({ open: true, options });
    });
  },
  respond: (value) => {
    resolver?.(value);
    resolver = null;
    set({ open: false, options: null });
  },
}));

/**
 * 替代 window.confirm 的用法。
 *
 *   if (!(await requestConfirm({ message: '删除这个？', danger: true }))) return;
 *
 * 好处：文案/按钮可 i18n、样式跟应用一致、不进浏览器原生弹窗（原生弹窗在
 * 某些环境里会被拦、也没法做主题）。
 */
export const requestConfirm = (options: ConfirmOptions) =>
  useConfirmStore.getState().requestConfirm(options);
