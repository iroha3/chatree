import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Brain, ChevronDown } from 'lucide-react';
import { MdPreview } from 'md-editor-rt';
import 'md-editor-rt/lib/preview.css';
import { ChatNode } from '../../types';
import { useThemeStore } from '../../stores/themeStore';
import { useModelStore } from '../../stores/modelStore';
import { useT } from '../../i18n';
import CopyButton from '../CopyButton';

/**
 * 长回答的阅读覆盖层（双击节点打开）。
 *
 * `.node-content` 被锁死在 max-height: 760px / overflow: hidden，回答一长就得在
 * 一个比手机还小的窗口里滚。这里开一个只读的覆盖层，只渲染**这一个节点**的
 * 提问 + 思考过程 + 回答，不改布局、不改数据。
 *
 * 用 portal 挂到 body：节点在 React Flow 的 transform 容器里，直接渲染会被
 * transform / overflow 裁掉，也会被别的节点盖住。
 */
interface NodeReadOverlayProps {
  node: ChatNode;
  /** 流式期间优先显示实时思维链 */
  streamingReasoning?: string | null;
  onClose: () => void;
}

const NodeReadOverlay: React.FC<NodeReadOverlayProps> = ({ node, streamingReasoning, onClose }) => {
  const t = useT();
  const { theme } = useThemeStore();
  const { models } = useModelStore();
  const [showReasoning, setShowReasoning] = React.useState(false);

  const reasoning = streamingReasoning || node.reasoning || '';
  const modelName = models.find(m => m.id === node.modelId)?.name;

  // Esc 关闭。挂在 window 上，不依赖内层元素是否聚焦。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // 打开期间锁掉 body 滚动
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        // 只有点到遮罩本身才关；拖动选择文字时滑出面板不关
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-[min(860px,94vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-neutral-700">
              {modelName || t('对话节点')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            title={t('关闭')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {node.userMessage ? (
            <div className="group relative rounded-lg bg-neutral-50 px-4 py-3">
              <div className="whitespace-pre-wrap pr-6 text-[15px] leading-relaxed text-neutral-700">
                {node.userMessage}
              </div>
              <CopyButton
                text={node.userMessage}
                className="absolute right-2 top-2 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 group-hover:opacity-100"
              />
            </div>
          ) : null}

          {reasoning ? (
            <div className="overflow-hidden rounded-lg border border-neutral-100">
              <button
                type="button"
                onClick={() => setShowReasoning(v => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
              >
                <span className="flex items-center">
                  <Brain size={13} className="mr-1.5" />
                  {t('思考过程')}
                </span>
                <ChevronDown size={13} className={`transition-transform ${showReasoning ? 'rotate-180' : ''}`} />
              </button>
              {showReasoning ? (
                <pre className="m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words border-t border-neutral-100 bg-neutral-50/50 px-3 py-2.5 font-sans text-xs leading-relaxed text-neutral-500">
                  {reasoning}
                </pre>
              ) : null}
            </div>
          ) : null}

          {node.type === 'chat' ? (
            node.assistantMessage ? (
              <div>
                <MdPreview
                  editorId={`overlay-${node.id}`}
                  modelValue={node.assistantMessage}
                  theme={theme}
                  noMermaid
                  className="md-preview reader overflow-auto break-words"
                  style={{ backgroundColor: 'transparent', maxWidth: '100%' }}
                  previewTheme="vuepress"
                />
              </div>
            ) : (
              <p className="py-8 text-center text-sm italic text-neutral-400">
                {node.isStreaming ? t('AI 正在思考...') : t('AI回复将显示在这里')}
              </p>
            )
          ) : null}
        </div>

        {node.type === 'chat' && node.assistantMessage ? (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-400">
            <span>{t('{n} 字', { n: node.assistantMessage.length })}</span>
            <CopyButton
              text={node.assistantMessage}
              size={12}
              label={t('复制')}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

export default NodeReadOverlay;
