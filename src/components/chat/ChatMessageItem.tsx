import React, { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, ChevronLeft, ChevronRight, RefreshCcw, Square, Edit2, Check, X } from 'lucide-react';
import { MdPreview } from 'md-editor-rt';
import 'md-editor-rt/lib/preview.css';
import { ChatNode, Model } from '../../types';
import { useThemeStore } from '../../stores/themeStore';
import { useT } from '../../i18n';
import CopyButton from '../CopyButton';
import { countChars } from '../../utils/text';
import { branchGroup } from '../../utils/tree';
import { getVendorIcon } from '../../services/vendorIcons';

export const BouncingDots: React.FC = () => (
  <span className="inline-flex items-end gap-0.5 leading-none" aria-hidden>
    <span className="animate-bounce leading-none">.</span>
    <span className="animate-bounce leading-none [animation-delay:120ms]">.</span>
    <span className="animate-bounce leading-none [animation-delay:240ms]">.</span>
  </span>
);

interface ChatMessageItemProps {
  node: ChatNode;
  allNodes: ChatNode[];
  model?: Model;
  streamingResponse?: string | null;
  streamingReasoning?: string | null;
  isStreaming?: boolean;
  onSwitchBranch: (targetNodeId: string) => void;
  onRetry: (nodeId: string) => void;
  onResubmit: (nodeId: string, newText: string) => void;
  onStop: (nodeId: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  node,
  allNodes,
  model,
  streamingResponse,
  streamingReasoning,
  isStreaming = false,
  onSwitchBranch,
  onRetry,
  onResubmit,
  onStop,
}) => {
  const t = useT();
  const { theme } = useThemeStore();

  // 正文与思考内容
  const responseText = streamingResponse !== undefined && streamingResponse !== null ? streamingResponse : node.assistantMessage;
  const reasoningText = streamingReasoning !== undefined && streamingReasoning !== null ? streamingReasoning : node.reasoning;

  // 阶段判定
  const isConnecting = isStreaming && !reasoningText && !responseText;
  const isThinking = isStreaming && !!reasoningText && !responseText;

  // 思考链折叠控制（DEV.md 约定：思考中展开，回答中/结束安静折叠）
  const [showReasoning, setShowReasoning] = useState(false);
  const reasoningTouchedRef = useRef(false);

  useEffect(() => {
    if (reasoningTouchedRef.current) return;
    if (isThinking) {
      setShowReasoning(true);
    } else if (responseText || !isStreaming) {
      setShowReasoning(false);
    }
  }, [isThinking, responseText, isStreaming]);

  // 用户消息就地编辑态
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [userDraft, setUserDraft] = useState(node.userMessage);

  useEffect(() => {
    setUserDraft(node.userMessage);
  }, [node.userMessage]);

  // 计算兄弟分支组
  const siblings = branchGroup(allNodes, node.id);
  const siblingIdx = siblings.findIndex((s) => s.id === node.id);
  const hasBranches = siblings.length > 1;

  const handlePrevBranch = () => {
    if (siblingIdx > 0) {
      onSwitchBranch(siblings[siblingIdx - 1].id);
    }
  };

  const handleNextBranch = () => {
    if (siblingIdx < siblings.length - 1) {
      onSwitchBranch(siblings[siblingIdx + 1].id);
    }
  };

  const handleSaveEdit = () => {
    const trimmed = userDraft.trim();
    if (!trimmed) return;
    setIsEditingUser(false);
    if (trimmed !== node.userMessage) {
      onResubmit(node.id, trimmed);
    }
  };

  const reasoningChars = reasoningText ? countChars(reasoningText) : 0;
  const responseChars = responseText ? countChars(responseText) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3 space-y-3">
      {/* 1. 用户提问气泡 */}
      <div className="flex flex-col items-end">
        <div className="group relative max-w-[85%] rounded-2xl bg-neutral-100/90 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-800 transition-colors">
          {isEditingUser ? (
            <div className="space-y-2 min-w-[280px]">
              <textarea
                value={userDraft}
                onChange={(e) => setUserDraft(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-800 focus:border-neutral-500 focus:outline-none"
                autoFocus
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setUserDraft(node.userMessage);
                    setIsEditingUser(false);
                  }}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200/80 transition-colors"
                >
                  <X size={12} className="inline mr-0.5" />
                  {t('取消')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  <Check size={12} className="inline mr-0.5" />
                  {t('保存并重答')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap select-text break-words pr-6">
                {node.userMessage || <span className="italic text-neutral-400">{t('（空）')}</span>}
              </div>

              {/* 悬浮操作：复制 / 编辑 */}
              <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setIsEditingUser(true)}
                  className="rounded p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
                  title={t('编辑消息')}
                >
                  <Edit2 size={12} />
                </button>
                <CopyButton
                  text={node.userMessage}
                  size={12}
                  className="rounded p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. 助手回答卡片 */}
      <div className="flex flex-col items-start w-full">
        <div className="w-full rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-sm transition-all space-y-2.5">
          {/* 助手头部：模型信息与分枝指示器 */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2 text-xs text-neutral-500">
            <div className="flex items-center gap-2 truncate">
              <span className="flex items-center text-neutral-500">
                {getVendorIcon(model?.modelName, model?.baseUrl, 14)}
              </span>
              <span className="font-medium text-neutral-700 truncate">{model?.name || t('智能助手')}</span>
            </div>

            {/* 分支切换器 < i / n > */}
            {hasBranches && (
              <div className="flex items-center gap-1 bg-neutral-50 border border-neutral-200/80 rounded-full px-2 py-0.5 text-[11px] text-neutral-500">
                <button
                  type="button"
                  onClick={handlePrevBranch}
                  disabled={siblingIdx === 0}
                  className="rounded p-0.5 hover:text-neutral-800 disabled:opacity-30 disabled:hover:text-neutral-500 transition-opacity"
                  title={t('上一分支')}
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="font-mono px-0.5">
                  {siblingIdx + 1} / {siblings.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextBranch}
                  disabled={siblingIdx === siblings.length - 1}
                  className="rounded p-0.5 hover:text-neutral-800 disabled:opacity-30 disabled:hover:text-neutral-500 transition-opacity"
                  title={t('下一分支')}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>

          {/* 连接中状态 */}
          {isConnecting && (
            <div className="flex items-center gap-2 py-4 text-xs text-neutral-400">
              <span>{t('生成中')}</span>
              <BouncingDots />
            </div>
          )}

          {/* 思考过程模块 */}
          {reasoningText ? (
            <div className="border border-neutral-100 rounded-lg overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => {
                  reasoningTouchedRef.current = true;
                  setShowReasoning(!showReasoning);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Brain size={13} className="text-neutral-400" />
                  {isThinking ? (
                    <>
                      <span>{t('思考中')}</span>
                      <BouncingDots />
                    </>
                  ) : (
                    <span>{t('思考过程 · {n} 字', { n: reasoningChars })}</span>
                  )}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-neutral-400 transition-transform ${showReasoning ? 'rotate-180' : ''}`}
                />
              </button>

              {showReasoning && (
                <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-neutral-100 bg-neutral-50/50 px-3 py-2 text-xs leading-relaxed text-neutral-500 font-sans">
                  {reasoningText}
                </pre>
              )}
            </div>
          ) : null}

          {/* 回答正文渲染 */}
          {responseText ? (
            <div className="overflow-hidden">
              <MdPreview
                editorId={`chat-${node.id}`}
                modelValue={responseText}
                theme={theme}
                noMermaid
                previewTheme="vuepress"
                className="md-preview overflow-auto break-words"
                style={{ backgroundColor: 'transparent', maxWidth: '100%' }}
              />
            </div>
          ) : !isConnecting && !isThinking && !node.error ? (
            <div className="py-4 text-center text-xs italic text-neutral-400">
              {t('等待回答…')}
            </div>
          ) : null}

          {/* 异常提示 */}
          {node.error && (
            <div className="rounded-lg bg-red-50/80 border border-red-200/60 p-2.5 text-xs text-red-600">
              {node.error}
            </div>
          )}

          {/* 底部元信息与操作簇 */}
          <div className="flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
            {/* 字数与用量 */}
            <div className="flex items-center gap-2">
              {responseChars > 0 && <span>{t('{n} 字', { n: responseChars })}</span>}
              {node.usage && (
                <>
                  {node.usage.durationMs ? (
                    <span>· {Math.round(node.usage.durationMs / 100) / 10}s</span>
                  ) : null}
                  {node.usage.durationMs && node.usage.completionTokens ? (
                    <span>
                      · ~{Math.round((node.usage.completionTokens / (node.usage.durationMs / 1000)) * 10) / 10} tok/s
                    </span>
                  ) : null}
                  <span>· ↑ {node.usage.promptTokens} tok</span>
                  <span>· ↓ {node.usage.completionTokens} tok</span>
                </>
              )}
            </div>

            {/* 动作按钮：停止 / 重试分支 / 复制 */}
            <div className="flex items-center gap-1">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => onStop(node.id)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                  title={t('停止生成')}
                >
                  <Square size={11} fill="currentColor" />
                  <span>{t('停止')}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onRetry(node.id)}
                    className="flex items-center gap-1 rounded p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                    title={t('重新生成分支')}
                  >
                    <RefreshCcw size={12} />
                  </button>
                  {responseText && (
                    <CopyButton
                      text={responseText}
                      size={12}
                      className="rounded p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
