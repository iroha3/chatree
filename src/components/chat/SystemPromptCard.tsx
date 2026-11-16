import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Check } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import { ChatNode } from '../../types';
import { useT } from '../../i18n';
import { countChars } from '../../utils/text';
import { generateId } from '../../utils/id';

interface SystemPromptCardProps {
  sessionId: string;
}

export const SystemPromptCard: React.FC<SystemPromptCardProps> = ({ sessionId }) => {
  const t = useT();
  const { sessions, updateNodeInSession, addNodeToSession } = useSessionStore();
  const { models } = useModelStore();
  const session = sessions.find((s) => s.id === sessionId);

  const systemNode = session?.nodes.find((n) => n.type === 'system');
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState(systemNode?.userMessage ?? '');

  useEffect(() => {
    setDraft(systemNode?.userMessage ?? '');
  }, [systemNode?.userMessage]);

  const handleSave = () => {
    if (!session) return;
    const trimmed = draft.trim();

    if (systemNode) {
      updateNodeInSession(sessionId, {
        ...systemNode,
        userMessage: trimmed,
        systemPromptTouched: true,
      });
    } else if (trimmed) {
      const defaultModel = models[0];
      const newSysNode: ChatNode = {
        id: generateId(),
        parentId: null,
        type: 'system',
        userMessage: trimmed,
        assistantMessage: '',
        modelId: defaultModel?.id || '',
        temperature: defaultModel?.temperature || 0.7,
        maxTokens: defaultModel?.maxTokens || 4096,
        createdAt: new Date().toISOString(),
        systemPromptTouched: true,
      };
      addNodeToSession(sessionId, newSysNode);
    }
    setIsExpanded(false);
  };

  const currentContent = systemNode?.userMessage || '';
  const charCount = countChars(currentContent);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-2">
      <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 transition-all overflow-hidden">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between px-3.5 py-2 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Settings size={13} className="text-neutral-400 shrink-0" />
            <span className="font-medium">{t('系统提示词')}</span>
            <span className="text-[11px] text-neutral-400">
              {currentContent ? `· ${t('{n} 字', { n: charCount })}` : `· ${t('（未设定）')}`}
            </span>
          </div>
          <ChevronDown
            size={13}
            className={`text-neutral-400 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isExpanded && (
          <div className="border-t border-neutral-200/60 p-3 bg-white/50 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('在此为该会话设定全局人设、角色或上下文约束…')}
              rows={3}
              className="w-full resize-none rounded-lg border border-neutral-200 bg-white p-2.5 text-xs leading-relaxed text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(systemNode?.userMessage ?? '');
                  setIsExpanded(false);
                }}
                className="rounded-md px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 transition-colors"
              >
                {t('取消')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                <Check size={12} />
                <span>{t('保存')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
