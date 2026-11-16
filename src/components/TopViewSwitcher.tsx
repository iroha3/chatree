import React from 'react';
import { MessageSquare, Network } from 'lucide-react';
import { useT } from '../i18n';
import { ViewMode } from '../stores/chatStore';

interface TopViewSwitcherProps {
  mode: ViewMode;
  onChange: (nextMode: ViewMode) => void;
}

export const TopViewSwitcher: React.FC<TopViewSwitcherProps> = ({ mode, onChange }) => {
  const t = useT();

  return (
    <div className="inline-flex items-center rounded-full border border-neutral-200/90 bg-white/95 p-0.5 shadow-minimal">
      <button
        type="button"
        onClick={() => onChange('chat')}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
          mode === 'chat'
            ? 'bg-neutral-900 font-medium text-white shadow-sm'
            : 'text-neutral-500 hover:text-neutral-900'
        }`}
        title={t('切换为线性对话模式')}
      >
        <MessageSquare size={12} />
        <span>{t('对话')}</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('tree')}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
          mode === 'tree'
            ? 'bg-neutral-900 font-medium text-white shadow-sm'
            : 'text-neutral-500 hover:text-neutral-900'
        }`}
        title={t('切换为树状画板模式')}
      >
        <Network size={12} />
        <span>{t('画板')}</span>
      </button>
    </div>
  );
};
