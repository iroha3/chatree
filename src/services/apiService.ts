import { Model, UsageStats } from '../types';
import { resolveReasoningEffort } from '../utils/reasoningEffort';
import { normalizeUsage, type RawUsage } from '../utils/usage';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequestOptions {
  messages: ChatMessage[];
  model: Model;
  temperature: number;
  maxTokens: number;
  sessionId?: string;
  sessionTitle?: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  /** 思维链分片回调。与正文分开，不会混进 messages */
  onReasoning?: (chunk: string) => void;
  /** token 用量回调。多数服务端需要 stream_options.include_usage 才会在流里返回 */
  onUsage?: (usage: UsageStats) => void;
}

/**
 * 变量插值：支持 {{sessionId}}、{{sessionTitle}}、{{modelName}} 等占位符
 */
export function interpolateVariables(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return key in vars ? vars[key] : `{{${key}}}`;
  });
}

/**
 * 递归对 JSON 对象/数组中的字符串进行插值
 */
export function interpolateDeep<T>(data: T, vars: Record<string, string>): T {
  if (typeof data === 'string') {
    return interpolateVariables(data, vars) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => interpolateDeep(item, vars)) as unknown as T;
  }
  if (data && typeof data === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      res[k] = interpolateDeep(v, vars);
    }
    return res as unknown as T;
  }
  return data;
}

/*
 * usage 的获取。
 *
 * 关键点：流式模式下，OpenAI 这类服务端「默认不返回 usage」—— 必须显式下发
 * stream_options.include_usage。DeepSeek 是个例外，它总是把 usage 挂在最后一个
 * 分片上。之前为了少一个兼容性风险没发这个参数，代价是：换个模型就什么统计都没有。
 *
 * 但确实有些兼容层收到不认识的字段直接 400。所以策略是：默认带，失败再退回不带，
 * 并把结论记在下面这个 Set 里 —— 同一个模型不会再白跑一次失败请求。
 */
const streamOptionsUnsupported = new Set<string>();

// 只在这些字样出现时才认为是「参数不被接受」，避免把「模型不存在」之类误判成重试
const PARAM_REJECTED = /stream_options|include_usage|unexpected keyword|extra inputs|unknown parameter|unexpected parameter|unsupported parameter|extra fields/i;

export async function sendChatRequest(options: ChatRequestOptions): Promise<void> {
  const { messages, model, temperature, maxTokens, sessionId, sessionTitle, signal, onChunk, onReasoning, onUsage } = options;
  
  try {
    // 去掉结尾多余的斜杠，避免拼出 //chat/completions
    const baseUrl = model.baseUrl.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const vars: Record<string, string> = {
      sessionId: sessionId ?? '',
      sessionTitle: sessionTitle ?? '',
      modelName: model.modelName,
    };

    const buildRequestBody = (withUsage: boolean): Record<string, unknown> => {
      const body: Record<string, unknown> = {
        model: model.modelName,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true
      };

      if (withUsage) {
        body.stream_options = { include_usage: true };
      }

      // 思考强度：'default' 时不下发该参数，保持服务商原有默认行为
      const reasoningEffort = resolveReasoningEffort(model);
      if (reasoningEffort !== 'default') {
        body.reasoning_effort = reasoningEffort;
      }

      // 用户自定义请求体：深浅合并至顶层，具有最高优先级（可覆盖默认字段或传入非标参数）
      if (model.customBody && typeof model.customBody === 'object') {
        const resolvedBody = interpolateDeep(model.customBody, vars);
        Object.assign(body, resolvedBody);
      }

      return body;
    };

    const buildHeaders = (): Record<string, string> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (model.apiKey) {
        headers['Authorization'] = `Bearer ${model.apiKey}`;
      }

      // 用户自定义 Header：可新增 Header（如 X-Conversation-Id），传空字符串可显式剔除默认 Header
      if (model.customHeaders && typeof model.customHeaders === 'object') {
        for (const [key, rawVal] of Object.entries(model.customHeaders)) {
          if (rawVal === '') {
            delete headers[key];
          } else if (typeof rawVal === 'string') {
            headers[key] = interpolateVariables(rawVal, vars);
          }
        }
      }

      return headers;
    };

    const send = (withUsage: boolean) =>
      fetch(endpoint, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(buildRequestBody(withUsage)),
        signal
      });

    const modelKey = `${baseUrl}|${model.modelName}`;
    const wantsUsage = onUsage ? !streamOptionsUnsupported.has(modelKey) : false;
    let response = await send(wantsUsage);

    if (!response.ok && wantsUsage && response.status >= 400 && response.status < 500) {
      const errorText = await response.text();
      if (!PARAM_REJECTED.test(errorText)) {
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      // 服务端不认 stream_options：记下来，这个模型以后都不再带，然后原样重发一次
      streamOptionsUnsupported.add(modelKey);
      response = await send(false);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete server-sent events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            break;
          }

          try {
            const json = JSON.parse(data);
            const choice = json.choices?.[0];
            
            // token 用量。字段名各家不一样，归一化逻辑放在 utils/usage.ts，
            // 那边是纯函数、有回归测试（tests/usage-check.mjs），
            // 别在这里再散一份映射出来。
            if (json.usage && onUsage) {
              onUsage(normalizeUsage(json.usage as RawUsage));
            }
            
            // 思考型模型的思维链，单独走一条通道，绝不混进正文
            const reasoning = choice?.delta?.reasoning_content;
            if (reasoning && onReasoning) {
              onReasoning(reasoning);
            }
            
            // 兼容 OpenAI / DeepSeek 等流式返回格式
            const content = choice?.delta?.content || 
                            choice?.text || 
                            json.output || 
                            '';
            
            if (content) {
              onChunk(content);
            }
          } catch {
            console.warn('Failed to parse SSE data:', data);
          }
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request was cancelled');
    }
    if (error instanceof Error && /failed to fetch|networkerror/i.test(error.message)) {
      const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\./i.test(model.baseUrl);
      const corsHint = isLocal
        ? '（连接失败：若使用 LM Studio / Ollama 等本地模型，请确认服务已启动并开启 CORS 跨域）'
        : '（网络连接失败，请检查网络连接或 API 地址是否支持跨域访问）';
      throw new Error(`${error.message} ${corsHint}`);
    }
    throw error;
  }
}
