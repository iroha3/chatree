import React, { useRef, useEffect, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { ModelQuickPicker } from './ModelQuickPicker';
import { useT } from '../../i18n';

interface ChatInputBarProps {
  currentModelId?: string;
  onSelectModel: (modelId: string) => void;
  onSendMessage: (text: string) => void;
  onStop: () => void;
  isGenerating?: boolean;
  onOpenSettings?: () => void;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  currentModelId,
  onSelectModel,
  onSendMessage,
  onStop,
  isGenerating = false,
  onOpenSettings,
}) => {
  const t = useT();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 随文字内容自适应高度（最大 200px）
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isGenerating) return;
    onSendMessage(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="sticky bottom-0 z-20 w-full bg-gradient-to-t from-neutral-50 via-neutral-50/90 to-transparent pb-4 pt-2">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="relative rounded-2xl border border-neutral-200/90 bg-white/95 p-2 shadow-minimal transition-all focus-within:border-neutral-300 focus-within:shadow-subtle">
          {/* 输入框顶部工具条：模型快切胶囊 */}
          <div className="mb-1.5 flex items-center justify-between px-1">
            <ModelQuickPicker
              currentModelId={currentModelId}
              onSelectModel={onSelectModel}
              onOpenSettings={onOpenSettings}
            />
            <span className="text-[11px] text-neutral-400 select-none">
              Ctrl+Enter {t('发送')}
            </span>
          </div>

          {/* 打字区域 */}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('给大模型发送消息…')}
              rows={1}
              className="max-h-[200px] min-h-[36px] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none"
            />

            {/* 动作按钮：发送或停止 */}
            <div className="shrink-0 pb-0.5">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors"
                  title={t('停止生成')}
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!text.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-white transition-all hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900"
                  title={t('发送 (Ctrl+Enter)')}
                >
                  <ArrowUp size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
