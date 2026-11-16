import { create } from 'zustand';
import { ChatNode } from '../types';
import { findLatestLeaf } from '../utils/tree';

export type ViewMode = 'chat' | 'tree';

const VIEW_MODE_STORAGE_KEY = 'treeai-view-modes';

function readStoredViewModes(): Record<string, ViewMode> {
  try {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, ViewMode>;
    }
    return {};
  } catch {
    return {};
  }
}

function persistViewModes(modes: Record<string, ViewMode>) {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(modes));
  } catch {
    // 忽略 localStorage 写入异常（如无痕模式存储配额受限）
  }
}

interface ChatStoreState {
  /** 各节点当前瞬时累积的正文流 */
  streamingResponses: Record<string, string>;
  /** 各节点当前瞬时累积的思考链流 */
  streamingReasoning: Record<string, string>;
  /** 各会话当前处于焦点的叶子节点（Chat 模式下的终点节点） */
  activeNodeIds: Record<string, string>;
  /** 各会话的视图模式记忆（'chat' | 'tree'） */
  viewModes: Record<string, ViewMode>;
  /** 各节点进行中的 AbortController */
  abortControllers: Record<string, AbortController>;

  setStreamingResponse: (nodeId: string, text: string) => void;
  setStreamingReasoning: (nodeId: string, text: string) => void;
  clearStreamingState: (nodeId: string) => void;

  setActiveNodeId: (sessionId: string, nodeId: string) => void;
  /** 获取当前激活节点，若未设置则自动回退到最新叶子节点 */
  resolveActiveNodeId: (sessionId: string, nodes: ChatNode[]) => string | undefined;

  setViewMode: (sessionId: string, mode: ViewMode) => void;
  getViewMode: (sessionId: string) => ViewMode;

  registerAbortController: (nodeId: string, controller: AbortController) => void;
  abortNode: (nodeId: string) => void;
  isStreaming: (nodeId: string) => boolean;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  streamingResponses: {},
  streamingReasoning: {},
  activeNodeIds: {},
  viewModes: readStoredViewModes(),
  abortControllers: {},

  setStreamingResponse: (nodeId, text) => {
    set((state) => ({
      streamingResponses: { ...state.streamingResponses, [nodeId]: text },
    }));
  },

  setStreamingReasoning: (nodeId, text) => {
    set((state) => ({
      streamingReasoning: { ...state.streamingReasoning, [nodeId]: text },
    }));
  },

  clearStreamingState: (nodeId) => {
    set((state) => {
      const nextResponses = { ...state.streamingResponses };
      const nextReasoning = { ...state.streamingReasoning };
      const nextControllers = { ...state.abortControllers };
      delete nextResponses[nodeId];
      delete nextReasoning[nodeId];
      delete nextControllers[nodeId];
      return {
        streamingResponses: nextResponses,
        streamingReasoning: nextReasoning,
        abortControllers: nextControllers,
      };
    });
  },

  setActiveNodeId: (sessionId, nodeId) => {
    set((state) => ({
      activeNodeIds: { ...state.activeNodeIds, [sessionId]: nodeId },
    }));
  },

  resolveActiveNodeId: (sessionId, nodes) => {
    const current = get().activeNodeIds[sessionId];
    if (current && nodes.some((n) => n.id === current)) {
      return current;
    }
    // 自动寻找当前会话中最新活跃的叶子节点
    const latestLeaf = findLatestLeaf(nodes);
    if (latestLeaf) {
      set((state) => ({
        activeNodeIds: { ...state.activeNodeIds, [sessionId]: latestLeaf.id },
      }));
      return latestLeaf.id;
    }
    return undefined;
  },

  setViewMode: (sessionId, mode) => {
    set((state) => {
      const nextModes = { ...state.viewModes, [sessionId]: mode };
      persistViewModes(nextModes);
      return { viewModes: nextModes };
    });
  },

  getViewMode: (sessionId) => {
    // 默认新会话为 'chat' 模式（B+ 方案）
    return get().viewModes[sessionId] ?? 'chat';
  },

  registerAbortController: (nodeId, controller) => {
    set((state) => ({
      abortControllers: { ...state.abortControllers, [nodeId]: controller },
    }));
  },

  abortNode: (nodeId) => {
    const controller = get().abortControllers[nodeId];
    if (controller) {
      controller.abort();
    }
  },

  isStreaming: (nodeId) => {
    return !!get().abortControllers[nodeId] || nodeId in get().streamingResponses;
  },
}));
