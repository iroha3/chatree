import { useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';
import { useChatStore } from '../stores/chatStore';
import { ChatNode } from '../types';
import { dispatchChatStream } from '../services/chatEngine';
import { deriveSessionTitle } from '../utils/sessionTitle';
import { generateId } from '../utils/id';
import { showError, showInfo } from '../utils/notification';
import { useT } from '../i18n';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../utils/modelDefaults';

export function useChatController() {
  const t = useT();
  const { models } = useModelStore();
  const {
    sessions,
    addNodeToSession,
    updateNodeInSession,
    touchSession,
    autoTitleSession,
  } = useSessionStore();

  const {
    streamingResponses,
    streamingReasoning,
    registerAbortController,
    abortNode,
    clearStreamingState,
    setStreamingResponse,
    setStreamingReasoning,
    setActiveNodeId,
    resolveActiveNodeId,
    isStreaming,
  } = useChatStore();

  /**
   * 核心调度：驱动指定节点进行流式生成并完成持久化
   */
  const runNodeGeneration = useCallback(
    async (sessionId: string, nodeId: string, nodesSnapshot?: ChatNode[]) => {
      const session = sessions.find((s) => s.id === sessionId);
      const allNodes = nodesSnapshot ?? session?.nodes ?? [];
      const node = allNodes.find((n) => n.id === nodeId);
      if (!node) return;

      const model = models.find((m) => m.id === node.modelId);
      if (!model) {
        showError(t('当前模型不存在，请重新选择'));
        updateNodeInSession(sessionId, {
          ...node,
          isStreaming: false,
          error: t('当前模型不存在，请重新选择'),
        });
        clearStreamingState(nodeId);
        return;
      }

      // 中止该节点前序可能在跑的请求
      abortNode(nodeId);

      const abortController = new AbortController();
      registerAbortController(nodeId, abortController);

      setStreamingResponse(nodeId, '');
      setStreamingReasoning(nodeId, '');

      // 会话标题若是默认标题，自动取首条问题命名
      const derivedTitle = deriveSessionTitle(node.userMessage);
      if (derivedTitle) {
        void autoTitleSession(sessionId, derivedTitle);
      }

      const result = await dispatchChatStream(
        node,
        allNodes,
        model,
        sessionId,
        abortController.signal,
        {
          onChunk: (accumulated) => setStreamingResponse(nodeId, accumulated),
          onReasoning: (accumulated) => setStreamingReasoning(nodeId, accumulated),
        }
      );

      // 持久化到 IndexedDB（通过 sessionStore）
      updateNodeInSession(sessionId, {
        ...node,
        assistantMessage: result.assistantMessage,
        reasoning: result.reasoning,
        usage: result.usage,
        error: result.error,
        isStreaming: false,
      });

      clearStreamingState(nodeId);
    },
    [
      sessions,
      models,
      t,
      abortNode,
      registerAbortController,
      setStreamingResponse,
      setStreamingReasoning,
      autoTitleSession,
      updateNodeInSession,
      clearStreamingState,
    ]
  );

  /**
   * 终止某个节点的生成
   */
  const handleStopNode = useCallback(
    (nodeId: string) => {
      abortNode(nodeId);
    },
    [abortNode]
  );

  /**
   * 发起一次新的提问（在 parentId 之下追加新节点）
   */
  const handleSendMessage = useCallback(
    async (
      sessionId: string,
      userMessage: string,
      parentId: string | null = null,
      customModelId?: string,
      position?: { x: number; y: number }
    ): Promise<ChatNode | null> => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return null;

      const parentNode = parentId ? session.nodes.find((n) => n.id === parentId) : null;
      const targetModelId =
        customModelId ||
        parentNode?.modelId ||
        models[0]?.id ||
        '';

      const model = models.find((m) => m.id === targetModelId);
      const temperature = model?.temperature ?? DEFAULT_TEMPERATURE;
      const maxTokens = model?.maxTokens ?? DEFAULT_MAX_TOKENS;

      const newNode: ChatNode = {
        id: generateId(),
        parentId,
        type: 'chat',
        userMessage: userMessage.trim(),
        assistantMessage: '',
        modelId: targetModelId,
        temperature,
        maxTokens,
        createdAt: new Date().toISOString(),
        isStreaming: true,
        position,
      };

      // addNodeToSession 内部会自动更新会话的 updatedAt，实现会话置顶
      addNodeToSession(sessionId, newNode);
      setActiveNodeId(sessionId, newNode.id);

      // 携带最新的全量节点快照发起生成
      void runNodeGeneration(sessionId, newNode.id, [...session.nodes, newNode]);
      return newNode;
    },
    [sessions, models, addNodeToSession, setActiveNodeId, runNodeGeneration]
  );

  /**
   * 重新生成分支（另起兄弟分支或对失败节点原位重试）
   */
  const handleRetryNode = useCallback(
    (
      sessionId: string,
      nodeId: string,
      computePosition?: (parentId: string) => { x: number; y: number } | undefined,
      onBranchCreated?: (branchId: string) => void
    ) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const node = session.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const model = models.find((m) => m.id === node.modelId);
      if (!model) {
        showError(t('当前模型不存在，请重新选择'));
        return;
      }

      // 如果已有回答或思考，另起一个兄弟分支（保持原答案不被破坏）
      if (node.assistantMessage || node.reasoning) {
        const branch: ChatNode = {
          ...node,
          id: generateId(),
          assistantMessage: '',
          reasoning: undefined,
          usage: undefined,
          error: undefined,
          isStreaming: true,
          createdAt: new Date().toISOString(),
          position: node.parentId && computePosition ? computePosition(node.parentId) : undefined,
        };

        addNodeToSession(sessionId, branch);
        setActiveNodeId(sessionId, branch.id);
        onBranchCreated?.(branch.id);
        showInfo(t('已创建新分支，正在生成…'));
        void runNodeGeneration(sessionId, branch.id, [...session.nodes, branch]);
        return;
      }

      // 首次生成中途异常/报错重试：直接在原节点上重新发起
      updateNodeInSession(sessionId, {
        ...node,
        isStreaming: true,
        error: undefined,
        reasoning: undefined,
        usage: undefined,
      });
      void runNodeGeneration(sessionId, node.id, session.nodes);
    },
    [sessions, models, t, addNodeToSession, setActiveNodeId, runNodeGeneration, updateNodeInSession]
  );

  /**
   * 原位重答（不另起分支，写回本节点，更新 updatedAt 置顶）
   */
  const handleResubmitNode = useCallback(
    (sessionId: string, nodeId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const node = session.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const model = models.find((m) => m.id === node.modelId);
      if (!model) {
        showError(t('当前模型不存在，请重新选择'));
        return;
      }

      const cleared: ChatNode = {
        ...node,
        assistantMessage: '',
        reasoning: undefined,
        usage: undefined,
        error: undefined,
        isStreaming: true,
      };

      updateNodeInSession(sessionId, cleared);
      touchSession(sessionId);
      void runNodeGeneration(
        sessionId,
        nodeId,
        session.nodes.map((n) => (n.id === nodeId ? cleared : n))
      );
    },
    [sessions, models, t, updateNodeInSession, touchSession, runNodeGeneration]
  );

  return {
    streamingResponses,
    streamingReasoning,
    isStreaming,
    stopNode: handleStopNode,
    sendMessage: handleSendMessage,
    retryNode: handleRetryNode,
    resubmitNode: handleResubmitNode,
    runNodeGeneration,
    setActiveNodeId,
    resolveActiveNodeId,
  };
}
