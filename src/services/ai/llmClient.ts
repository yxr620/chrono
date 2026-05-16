/**
 * LLM Client
 * 统一调用 OpenAI 兼容接口，支持流式输出
 * 零依赖，使用原生 fetch + ReadableStream
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface ChatCompletionRequestOptions {
  stream: boolean;
  temperature: number;
  maxTokens: number;
}

export const CHAT_STREAM_REQUEST_OPTIONS = {
  stream: true,
  temperature: 0.7,
  maxTokens: 2048,
} as const satisfies ChatCompletionRequestOptions;

export const CHAT_ONCE_REQUEST_OPTIONS = {
  stream: false,
  temperature: 0,
  maxTokens: 1024,
} as const satisfies ChatCompletionRequestOptions;

export const CHAT_WITH_TOOLS_REQUEST_OPTIONS = {
  stream: false,
  temperature: 0.7,
  maxTokens: 2048,
} as const satisfies ChatCompletionRequestOptions;

export function toChatCompletionPayloadOptions(options: ChatCompletionRequestOptions) {
  return {
    stream: options.stream,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  };
}

/**
 * 流式调用 OpenAI 兼容接口
 * @param config LLM 配置
 * @param messages 消息列表
 * @param onChunk 增量 token 回调
 * @param signal 中断信号
 * @returns 完整文本
 */
export async function chatStream(
  config: LLMConfig,
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
  onThinking?: (delta: string) => void,
): Promise<string> {
  const url = `${config.baseURL.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      ...toChatCompletionPayloadOptions(CHAT_STREAM_REQUEST_OPTIONS),
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 请求失败 (${res.status}): ${errText || res.statusText}`);
  }

  if (!res.body) {
    throw new Error('响应无 body');
  }

  // 解析 SSE 流
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  // <think> tag streaming parser state (Qwen3 等模型在 content 中输出推理过程)
  let insideThink = false;
  let tagBuf = '';

  /** 检查 text 末尾是否与 tag 的某个前缀匹配，返回匹配长度 */
  function partialTagLen(text: string, tag: string): number {
    const maxCheck = Math.min(tag.length - 1, text.length);
    for (let i = maxCheck; i >= 1; i--) {
      if (text.endsWith(tag.slice(0, i))) return i;
    }
    return 0;
  }

  /** 处理 content chunk，将 <think> 块路由到 onThinking */
  function processContentChunk(raw: string) {
    tagBuf += raw;
    while (tagBuf.length > 0) {
      if (insideThink) {
        const endIdx = tagBuf.indexOf('</think>');
        if (endIdx !== -1) {
          const t = tagBuf.slice(0, endIdx);
          if (t && onThinking) onThinking(t);
          tagBuf = tagBuf.slice(endIdx + 8).replace(/^\n/, '');
          insideThink = false;
        } else {
          const keep = partialTagLen(tagBuf, '</think>');
          const safe = tagBuf.length - keep;
          if (safe > 0) {
            if (onThinking) onThinking(tagBuf.slice(0, safe));
            tagBuf = tagBuf.slice(safe);
          }
          break;
        }
      } else {
        const startIdx = tagBuf.indexOf('<think>');
        if (startIdx !== -1) {
          const before = tagBuf.slice(0, startIdx);
          if (before) { full += before; onChunk(before); }
          tagBuf = tagBuf.slice(startIdx + 7);
          insideThink = true;
        } else {
          const keep = partialTagLen(tagBuf, '<think>');
          const safe = tagBuf.length - keep;
          if (safe > 0) {
            const s = tagBuf.slice(0, safe);
            full += s;
            onChunk(s);
            tagBuf = tagBuf.slice(safe);
          }
          break;
        }
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        // 主回答 content（含 <think> 标签过滤）
        const content: string = delta.content || '';
        if (content) {
          processContentChunk(content);
        }

        // Thinking 模型的推理过程（Qwen-QwQ / DeepSeek-R1 等，使用独立字段，Ollama 使用 thinking）
        const reasoning: string =
          delta.reasoning_content || delta.thinking_content || delta.thinking || '';
        if (reasoning && onThinking) {
          onThinking(reasoning);
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  // 刷新 tag buffer 中的剩余内容
  if (tagBuf) {
    if (insideThink) {
      if (onThinking) onThinking(tagBuf);
    } else {
      full += tagBuf;
      onChunk(tagBuf);
    }
  }

  return full;
}

/**
 * 非流式调用，直接返回完整文本
 * 用于时间提取等需要完整响应的轻量调用
 */
export async function chatOnce(
  config: LLMConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const url = `${config.baseURL.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      ...toChatCompletionPayloadOptions(CHAT_ONCE_REQUEST_OPTIONS),
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 请求失败 (${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

/**
 * 带工具声明的非流式调用
 * 返回完整 message 对象（可能包含 tool_calls）
 */
export interface ToolCallResult {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessageWithTools {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCallResult[];
  thinking?: string;
}

export async function chatWithTools(
  config: LLMConfig,
  messages: ChatMessage[],
  tools: unknown[],
  signal?: AbortSignal,
): Promise<ChatMessageWithTools> {
  const url = `${config.baseURL.replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      ...toChatCompletionPayloadOptions(CHAT_WITH_TOOLS_REQUEST_OPTIONS),
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 请求失败 (${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json();
  const message = json.choices?.[0]?.message;
  if (!message) {
    throw new Error('LLM 响应格式异常：无 message');
  }

  // Strip <think>...</think> blocks (Qwen3 等模型会在 content 中输出推理过程)
  const rawContent = message.content || '';
  let thinkingContent = message.reasoning_content || message.thinking_content || message.thinking || '';
  const cleanContent = rawContent.replace(/<think>([\s\S]*?)<\/think>\n?/g, (_: string, t: string) => {
    if (!thinkingContent) thinkingContent += t;
    return '';
  }).trim();

  return {
    role: 'assistant',
    content: cleanContent || null,
    tool_calls: message.tool_calls || undefined,
    thinking: thinkingContent || undefined,
  };
}
