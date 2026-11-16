import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import { useChatStore } from '../../stores/chatStore';
import { useChatController } from '../../hooks/useChatController';
import { buildPath, findLatestLeaf } from '../../utils/tree';
import { SystemPromptCard } from './SystemPromptCard';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInputBar } from './ChatInputBar';
import { useT } from '../../i18n';
import { Bot, Share2, BarChart3, FileText, FileJson, Network } from 'lucide-react';
import SessionStats from '../SessionStats';
import { exportSessionToFile } from '../../utils/sessionTransfer';
import { exportSessionToMarkdown } from '../../utils/markdownExport';
import { exportToMindmap } from '../../utils/exportUtils';
import { showSuccess, showError } from '../../utils/notification';

interface ChatViewProps {
  sessionId: string;
  onOpenSettings?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ sessionId, onOpenSettings }) => {
  const t = useT();
  const { sessions, updateNodeInSession } = useSessionStore();
  const { models } = useModelStore();
  const session = sessions.find((s) => s.id === sessionId);
  const nodes = useMemo(() => session?.nodes ?? [], [session?.nodes]);

  const {
    activeNodeIds,
    setActiveNodeId,
    resolveActiveNodeId,
    streamingResponses,
    streamingReasoning,
    isStreaming,
  } = useChatStore();

  const {
    sendMessage,
    retryNode,
    resubmitNode,
    stopNode,
  } = useChatController();

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showStats, setShowStats] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showExportMenu]);

  const handleExportMarkdown = () => {
    if (!session) return;
    try {
      exportSessionToMarkdown(session);
      showSuccess(t('已导出 Markdown 文档'));
    } catch (error) {
      console.error('Failed to export markdown:', error);
      showError(t('导出 Markdown 失败'));
    }
  };

  const handleExportSession = () => {
    if (!session) return;
    try {
      exportSessionToFile(session);
      showSuccess(t('会话已导出为 JSON 文件'));
    } catch (error) {
      console.error('Failed to export session:', error);
      showError(t('导出会话失败'));
    }
  };

  const handleExportMindmap = () => {
    if (!session) return;
    try {
      exportToMindmap(session);
      showSuccess(t('思维导图已导出'));
    } catch (error) {
      console.error('Failed to export mindmap:', error);
      showError(t('导出思维导图失败'));
    }
  };

  // 1. 定位当前激活的叶子节点
  const currentActiveId = activeNodeIds[sessionId];
  const activeNodeId = useMemo(() => {
    return currentActiveId && nodes.some((n) => n.id === currentActiveId)
      ? currentActiveId
      : resolveActiveNodeId(sessionId, nodes);
  }, [sessionId, nodes, currentActiveId, resolveActiveNodeId]);

  // 2. 根据激活节点提取单一线性路径
  const path = useMemo(() => {
    if (!activeNodeId) return [];
    return buildPath(nodes, activeNodeId);
  }, [nodes, activeNodeId]);

  // 过滤掉系统节点（系统节点已置顶在 SystemPromptCard 单独渲染）
  const chatMessages = useMemo(() => {
    return path.filter((n) => n.type === 'chat');
  }, [path]);

  // 当前选中的模型（会话默认继承最新节点的模型，或全局第一个模型）
  const lastChatNode = chatMessages[chatMessages.length - 1];
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return lastChatNode?.modelId || models[0]?.id || '';
  });

  useEffect(() => {
    if (lastChatNode?.modelId) {
      setSelectedModelId(lastChatNode.modelId);
    } else if (models[0]?.id && !selectedModelId) {
      setSelectedModelId(models[0].id);
    }
  }, [lastChatNode?.modelId, models, selectedModelId]);

  // 是否当前正在流式输出
  const isAnyStreaming = useMemo(() => {
    return nodes.some((n) => isStreaming(n.id));
  }, [nodes, isStreaming]);

  // 滚动到底部逻辑
  const scrollToBottom = useCallback((smooth = false) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // 监听滚动位置，若用户往上翻了，停止强行自动吸底
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  // 流式中自动跟进滚动
  useEffect(() => {
    if (isAnyStreaming && shouldAutoScrollRef.current) {
      scrollToBottom(false);
    }
  }, [isAnyStreaming, streamingResponses, scrollToBottom]);

  // 切换分支
  const handleSwitchBranch = useCallback(
    (targetNodeId: string) => {
      // 找到目标分支下最新的叶子节点
      const targetLeaf = findLatestLeaf(nodes, targetNodeId);
      const nextLeafId = targetLeaf ? targetLeaf.id : targetNodeId;
      setActiveNodeId(sessionId, nextLeafId);
      shouldAutoScrollRef.current = false;
    },
    [nodes, sessionId, setActiveNodeId]
  );

  // 发送新消息
  const handleSend = useCallback(
    async (text: string) => {
      const parentId = activeNodeId ?? null;
      shouldAutoScrollRef.current = true;
      const newNode = await sendMessage(sessionId, text, parentId, selectedModelId);
      if (newNode) {
        setTimeout(() => scrollToBottom(true), 50);
      }
    },
    [activeNodeId, sendMessage, sessionId, selectedModelId, scrollToBottom]
  );

  // 停止生成
  const handleStop = useCallback(() => {
    const streamingNode = nodes.find((n) => isStreaming(n.id));
    if (streamingNode) {
      stopNode(streamingNode.id);
    }
  }, [nodes, isStreaming, stopNode]);

  // 用户就地修改提问并重答
  const handleResubmitMessage = useCallback(
    (nodeId: string, newText: string) => {
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) return;
      // 更新原问题文字
      updateNodeInSession(sessionId, {
        ...targetNode,
        userMessage: newText,
      });
      resubmitNode(sessionId, nodeId);
    },
    [nodes, updateNodeInSession, sessionId, resubmitNode]
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-neutral-50/50">
      {/* 顶部右上角工具栏：统计与导出 */}
      <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
        <button
          type="button"
          className="flex items-center justify-center p-2 bg-white/95 border border-neutral-200 rounded-md text-neutral-700 hover:bg-neutral-50 transition-colors shadow-minimal"
          onClick={() => setShowStats((v) => !v)}
          title={t('会话统计')}
        >
          <BarChart3 size={16} />
        </button>

        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            className={`flex items-center justify-center p-2 border rounded-md transition-colors shadow-minimal ${
              showExportMenu
                ? 'bg-neutral-100 border-neutral-300 text-neutral-900'
                : 'bg-white/95 border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
            onClick={() => setShowExportMenu((v) => !v)}
            title={t('分享与导出')}
          >
            <Share2 size={16} />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-subtle animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
                onClick={() => {
                  setShowExportMenu(false);
                  handleExportMarkdown();
                }}
              >
                <FileText size={14} className="shrink-0 text-neutral-500" />
                <span>{t('Markdown (.md)')}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
                onClick={() => {
                  setShowExportMenu(false);
                  handleExportSession();
                }}
              >
                <FileJson size={14} className="shrink-0 text-neutral-500" />
                <span>{t('JSON 备份')}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
                onClick={() => {
                  setShowExportMenu(false);
                  handleExportMindmap();
                }}
              >
                <Network size={14} className="shrink-0 text-neutral-500" />
                <span>{t('思维导图 (.mm)')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {showStats && session && (
        <SessionStats session={session} onClose={() => setShowStats(false)} />
      )}

      {/* 滚动容器 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden pt-4 pb-8 space-y-4"
      >
        {/* 系统提示词卡片 */}
        <SystemPromptCard sessionId={sessionId} />

        {/* 消息瀑布流 */}
        {chatMessages.length > 0 ? (
          chatMessages.map((node) => {
            const model = models.find((m) => m.id === node.modelId);
            return (
              <ChatMessageItem
                key={node.id}
                node={node}
                allNodes={nodes}
                model={model}
                streamingResponse={streamingResponses[node.id]}
                streamingReasoning={streamingReasoning[node.id]}
                isStreaming={isStreaming(node.id)}
                onSwitchBranch={handleSwitchBranch}
                onRetry={(id) => retryNode(sessionId, id)}
                onResubmit={handleResubmitMessage}
                onStop={stopNode}
              />
            );
          })
        ) : (
          /* 空会话欢迎状态 */
          <div className="flex h-[50vh] flex-col items-center justify-center text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-neutral-200/80 shadow-minimal text-neutral-600 mb-3">
              <Bot size={24} />
            </div>
            <h3 className="text-base font-medium text-neutral-800 mb-1">
              {t('开始新的对话')}
            </h3>
            <p className="max-w-sm text-xs leading-relaxed text-neutral-500">
              {t('在下方输入框发送问题，随时可以在顶部切换为画板模式查看分支。')}
            </p>
          </div>
        )}
      </div>

      {/* 底部打字输入框 */}
      <ChatInputBar
        currentModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
        onSendMessage={handleSend}
        onStop={handleStop}
        isGenerating={isAnyStreaming}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
};
