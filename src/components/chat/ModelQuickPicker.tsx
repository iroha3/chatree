import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Settings2, Plus } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { getVendorIcon } from '../../services/vendorIcons';
import { useT } from '../../i18n';

interface ModelQuickPickerProps {
  currentModelId?: string;
  onSelectModel: (modelId: string) => void;
  onOpenSettings?: () => void;
}

export const ModelQuickPicker: React.FC<ModelQuickPickerProps> = ({
  currentModelId,
  onSelectModel,
  onOpenSettings,
}) => {
  const t = useT();
  const { models } = useModelStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModel = models.find((m) => m.id === currentModelId) || models[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  if (models.length === 0) {
    return (
      <button
        onClick={onOpenSettings}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600 hover:border-neutral-400 hover:bg-neutral-100 transition-colors"
      >
        <Plus size={12} />
        <span>{t('添加模型')}</span>
      </button>
    );
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-minimal hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
        title={t('点击切换模型')}
      >
        <span className="flex items-center text-neutral-500">
          {getVendorIcon(selectedModel?.modelName, selectedModel?.baseUrl, 13)}
        </span>
        <span className="max-w-[140px] truncate">{selectedModel?.name || t('默认模型')}</span>
        <ChevronDown size={12} className={`text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {models.map((model) => {
              const isSelected = model.id === selectedModel?.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(model.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-neutral-100 font-medium text-neutral-900'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="shrink-0 text-neutral-500">
                      {getVendorIcon(model.modelName, model.baseUrl, 13)}
                    </span>
                    <span className="truncate">{model.name}</span>
                  </div>
                  {isSelected && <Check size={13} className="shrink-0 text-neutral-700" />}
                </button>
              );
            })}
          </div>

          {onOpenSettings && (
            <div className="mt-1 border-t border-neutral-100 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 transition-colors"
              >
                <Settings2 size={12} />
                <span>{t('管理模型...')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
