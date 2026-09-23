import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useConfirmStore } from '../stores/confirmStore';
import { useT } from '../i18n';

/**
 * 应用内确认框。挂在 App 根部，替代 window.confirm。
 *
 * 交互：Esc / 点遮罩 = 取消，Enter = 确定。弹出时焦点落在确定按钮上，
 * 所以「键盘回车」和「点按钮」语义一致。
 */
const ConfirmDialog: React.FC = () => {
  const { open, options, respond } = useConfirmStore();
  const t = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        respond(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        respond(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, respond]);

  if (!open || !options) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      // 点遮罩取消。用 onMouseDown 而不是 onClick，避免「在弹窗内按下、拖到遮罩上松开」误取消。
      onMouseDown={() => respond(false)}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          {options.danger && (
            <div className="mt-0.5 shrink-0 text-red-500">
              <AlertTriangle size={20} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {options.title && (
              <h3 className="mb-3 text-sm font-medium text-neutral-800">{options.title}</h3>
            )}
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-neutral-600">
              {options.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
            onClick={() => respond(false)}
          >
            {options.cancelLabel ?? t('取消')}
          </button>
          <button
            ref={confirmRef}
            className={`rounded-md px-3 py-1.5 text-sm text-white transition-colors ${
              options.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-neutral-900 hover:bg-neutral-800'
            }`}
            onClick={() => respond(true)}
          >
            {options.confirmLabel ?? t('确定')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
