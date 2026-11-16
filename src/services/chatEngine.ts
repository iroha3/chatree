import { ChatNode, Model, UsageStats } from '../types';
import { sendChatRequest } from './apiService';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 组装发送给 LLM API 的完整消息链。
 *
 * 契约规范（与 DEV.md §3.12 严格一致）：
 * 1. 系统提示词**只来自系统节点本身**（`systemNode.userMessage`）。
 *    若系统节点被删除或被用户清空，绝不拿模型的默认提示词兜底（避免「用户清空了却复活」）。
 * 2. 从目标节点的 `parentId` 沿祖先链向上遍历，按时间正序收集历史对话。
 * 3. 万一数据损坏成环，用 `seen` 集合守住，绝不无限循环。
 * 4. 最后追加目标节点本身的 `userMessage`。
 */
export function buildMessageChain(
  nodes: ChatNode[],
  targetNode: ChatNode
): ChatMessage[] {
  const systemNode = nodes.find((n) => n.type === 'system');
  const systemPrompt = systemNode ? systemNode.userMessage : '';
  const messages: ChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const historyChain: { user: string; assistant: string }[] = [];

  let curParentId = targetNode.parentId;
  while (curParentId && !seen.has(curParentId)) {
    seen.add(curParentId);
    const parentNode = byId.get(curParentId);
    if (parentNode && parentNode.type === 'chat') {
      historyChain.unshift({
        user: parentNode.userMessage,
        assistant: parentNode.assistantMessage,
      });
    }
    curParentId = parentNode?.parentId ?? null;
  }

  for (const msg of historyChain) {
    if (msg.user) messages.push({ role: 'user', content: msg.user });
    if (msg.assistant) messages.push({ role: 'assistant', content: msg.assistant });
  }

  messages.push({ role: 'user', content: targetNode.userMessage });
  return messages;
}

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onUsage?: (usage: UsageStats) => void;
}

export interface DispatchStreamResult {
  assistantMessage: string;
  reasoning?: string;
  usage?: UsageStats;
  aborted: boolean;
  error?: string;
}

/**
 * 发起单次对话流式调度。
 *
 * 统一处理：
 * 1. 消息链组装；
 * 2. 流式分片与思维链实时累积；
 * 3. 耗时（durationMs）计算与 token 统计归一化；
 * 4. 中途 Abort 截断（保持已生成内容不丢失）与异常兜底。
 */
export async function dispatchChatStream(
  node: ChatNode,
  nodesSnapshot: ChatNode[],
  model: Model,
  sessionId: string,
  signal: AbortSignal,
  callbacks: StreamCallbacks
): Promise<DispatchStreamResult> {
  const messages = buildMessageChain(nodesSnapshot, node);

  let accumulatedResponse = '';
  let accumulatedReasoning = '';
  let accumulatedUsage: UsageStats | undefined;
  const startedAt = Date.now();

  try {
    await sendChatRequest({
      messages,
      model,
      temperature: node.temperature,
      maxTokens: node.maxTokens,
      sessionId,
      signal,
      onChunk: (chunk) => {
        accumulatedResponse += chunk;
        callbacks.onChunk?.(accumulatedResponse);
      },
      onReasoning: (chunk) => {
        accumulatedReasoning += chunk;
        callbacks.onReasoning?.(accumulatedReasoning);
      },
      onUsage: (u) => {
        accumulatedUsage = u;
        callbacks.onUsage?.(u);
      },
    });

    const finalUsage = accumulatedUsage
      ? { ...accumulatedUsage, durationMs: Date.now() - startedAt }
      : undefined;

    return {
      assistantMessage: accumulatedResponse,
      reasoning: accumulatedReasoning || undefined,
      usage: finalUsage,
      aborted: false,
    };
  } catch (error: unknown) {
    const isAborted =
      signal.aborted ||
      (error instanceof Error && (error.name === 'AbortError' || /cancel/i.test(error.message)));
    const message = error instanceof Error ? error.message : 'Failed to get response';

    const finalUsage = accumulatedUsage
      ? { ...accumulatedUsage, durationMs: Date.now() - startedAt }
      : undefined;

    if (isAborted) {
      // 停止生成：保留已累积的内容，标记 aborted = true
      return {
        assistantMessage: accumulatedResponse,
        reasoning: accumulatedReasoning || undefined,
        usage: finalUsage,
        aborted: true,
      };
    }

    return {
      assistantMessage: accumulatedResponse || node.assistantMessage,
      reasoning: accumulatedReasoning || undefined,
      usage: finalUsage,
      aborted: false,
      error: message,
    };
  }
}
