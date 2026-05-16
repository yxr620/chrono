/**
 * LLM Client — Vercel AI SDK adapter
 *
 * One unified abstraction over OpenAI-compatible providers (Qwen / Gemini-openai
 * / GLM / Kimi / MiniMax / OpenAI / custom / Managed). All three exports use the
 * same `LanguageModel` and only differ in streaming vs. one-shot semantics.
 *
 * Replaces the previous hand-rolled `chatStream`/`chatWithTools`/`chatOnce`.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  streamText,
  generateText,
  stepCountIs,
  type ModelMessage,
  type LanguageModel,
  type StreamTextResult,
  type GenerateTextResult,
  type Tool,
} from 'ai';

/** Public message shape used by AIAssistant.tsx + toolCallEngine + quickCapture */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  // SDK accepts richer shapes (e.g. parts arrays); we accept that pass-through
  // anywhere it's actually needed via the `CoreMessage` re-export below.
}

export type { ModelMessage };

/** @deprecated Use ModelMessage instead */
export type CoreMessage = ModelMessage;

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** Build a LanguageModel from a Chrono LLMConfig. Caller can reuse across calls. */
export function createLanguageModel(config: LLMConfig): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'chrono',
    baseURL: config.baseURL.replace(/\/$/, ''),
    apiKey: config.apiKey,
  });
  return provider.chatModel(config.model);
}

/**
 * Streaming chat with tools — drives the AI Assistant tool loop.
 *
 * Returns the SDK's StreamTextResult. Consumers iterate `result.fullStream`
 * and translate events into UI phases / chunks. The SDK handles:
 *   - cross-chunk tool_call argument accumulation
 *   - multi-step tool calling (maxSteps rounds)
 *   - reasoning_content / thinking / <think> normalisation
 *   - per-provider transform quirks (Mistral 9-char IDs, etc.)
 */
export function streamChatWithTools(opts: {
  model: LanguageModel;
  messages: ModelMessage[];
  tools: Record<string, Tool>;
  maxSteps?: number;
  abortSignal?: AbortSignal;
}): StreamTextResult<Record<string, Tool>, never> {
  return streamText({
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools,
    // AI SDK v5 replaced maxSteps with stopWhen; stepCountIs(n) replicates the old behaviour.
    stopWhen: stepCountIs(opts.maxSteps ?? 5),
    abortSignal: opts.abortSignal,
    // Auto-fix common model errors like wrong tool name casing.
    experimental_repairToolCall: async ({ toolCall, tools }) => {
      const wanted = toolCall.toolName.toLowerCase();
      const match = Object.keys(tools).find(k => k.toLowerCase() === wanted);
      return match && match !== toolCall.toolName
        ? { ...toolCall, toolName: match }
        : null;
    },
  });
}

/**
 * Non-streaming one-shot — drives quickCapture parse and any future single-call uses.
 * Returns the full assistant response with tool_calls already extracted.
 */
export async function generateChatOnce(opts: {
  model: LanguageModel;
  messages: ModelMessage[];
  tools?: Record<string, Tool>;
  abortSignal?: AbortSignal;
}): Promise<GenerateTextResult<Record<string, Tool>, never>> {
  return await generateText({
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools,
    abortSignal: opts.abortSignal,
  });
}

/**
 * Recognise provider errors that mean "function calling unsupported".
 * Used by the engine to surface a friendly Chinese message instead of
 * silently falling back to a no-tools answer (the old behaviour).
 */
export function isUnsupportedToolsError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!msg) return false;
  const phrases = [
    'does not support tool',
    'does not support function',
    'tools parameter is not',
    'tools is not supported',
    'tool_choice is not',
    'function calling is not supported',
    'function calling not supported',
    'function_call is not',
    'tool calling is not supported',
    '不支持工具',
    '不支持函数调用',
  ];
  return phrases.some(p => msg.includes(p));
}
