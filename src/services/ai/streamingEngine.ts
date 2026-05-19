/**
 * Streaming Engine — pure SDK event-translation layer.
 *
 * Reads Vercel AI SDK v5 `fullStream` events and dispatches them to
 * `onPhase / onChunk / onToolCall` callbacks. Caller is responsible for
 * constructing the system prompt, message history, and SDK tools (including
 * any confirmation gating via `actionRegistry.toSdkTools({...})`).
 *
 * Two callers:
 *   - `toolCallEngine.runToolCallLoop` (AI Assistant, multi-step, with history)
 *   - `quickCaptureParse.parseTranscript` (one-shot parse with maxSteps:1)
 *
 * Phase mapping (SDK v5 fullStream events):
 *   - requesting    : from pre-stream fallback emit (carries MODEL REQUEST debug);
 *                     re-emitted on each `start-step` after a `finish-step` resets
 *                     `requestingEmittedThisStep`
 *   - reasoning     : first `reasoning-delta` in a step (Qwen instruct / GLM-flash
 *                     never emit reasoning, so this row may not appear)
 *   - composingTool : `tool-input-start` → until `tool-call` overrides it
 *   - toolCall      : `tool-call` → updated when `tool-result` arrives (covers
 *                     only local action execution, ms-level)
 *   - answering     : first `text-delta` after `tool-result` (or after model
 *                     start in tool-less queries)
 *
 * SDK v5 event field notes:
 *   - text-delta       → { type, id, text: string }
 *   - reasoning-delta  → { type, id, text: string }
 *   - tool-input-start → { type, id, toolName: string }
 *   - tool-call        → { type, toolCallId, toolName, input }
 *   - tool-result      → { type, toolCallId, toolName, input, output }
 *   - start-step       → { type, request, warnings }
 *   - finish-step      → { type, response, usage, finishReason, providerMetadata }
 */

import {
  streamChatWithTools,
  isUnsupportedToolsError,
  type ModelMessage,
} from './llmClient';
import type { LanguageModel, Tool } from 'ai';
// Import directly from registry (not the side-effecty index) — we only need
// `actionRegistry.get()` for fallback label lookup, and avoiding the index
// keeps this module's dependency graph minimal so test environments and the
// QuickCapture caller don't pay for action handler / gateway side effects.
import { actionRegistry } from '../actions/registry';
import {
  createToolResultDebug,
  createTextDebug,
  type AssistantDebugInfoPayload,
} from './debugInfo';

export interface StreamingToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface StreamingEngineCallbacks {
  onPhase: (
    phase: string,
    detail?: string,
    debugInfo?: AssistantDebugInfoPayload,
    failed?: boolean,
  ) => void;
  onChunk?: (delta: string) => void;
  onToolCall?: (info: StreamingToolCallInfo) => void;
}

export interface StreamingEngineResult {
  content: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export interface StreamingEngineOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  tools: Record<string, Tool>;
  callbacks: StreamingEngineCallbacks;
  /** Default 5. QuickCapture passes 1. */
  maxSteps?: number;
  abortSignal?: AbortSignal;
  /** Used in MODEL REQUEST debug info. e.g. config.model. */
  modelLabel?: string;
}

function formatToolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'query_time_entries': {
      const parts = [`${args.start_date} ~ ${args.end_date}`];
      if (args.category) parts.push(`类别: ${args.category}`);
      if (args.goal) parts.push(`目标: ${args.goal}`);
      return `查询记录 (${parts.join(', ')})`;
    }
    case 'list_categories':
      return '获取类别列表';
    case 'list_goals':
      return `获取目标 (${args.start_date} ~ ${args.end_date})`;
    case 'add_entry':
      return `添加记录 (${args.date} ${args.start_time}-${args.end_time} ${args.activity})`;
    default: {
      const action = actionRegistry.get(name);
      if (action) return action.description.slice(0, 30);
      return name;
    }
  }
}

/** SDK v5 fullStream text-delta uses `text`; legacy shapes used `textDelta`. */
function readTextDelta(ev: any): string {
  return typeof ev.textDelta === 'string'
    ? ev.textDelta
    : typeof ev.text === 'string'
      ? ev.text
      : '';
}

export async function runStreamingToolCallLoop(
  opts: StreamingEngineOptions,
): Promise<StreamingEngineResult> {
  const { model, messages, tools, callbacks, maxSteps = 5, abortSignal, modelLabel = 'unknown' } = opts;

  type PhaseKind = 'requesting' | 'reasoning' | 'composingTool' | 'toolCall' | 'answering' | null;
  let currentPhaseKind: PhaseKind = null;
  let stepIdx = 0;
  let requestingEmittedThisStep = false;
  let reasoningEmittedThisStep = false;
  let textBuf = '';
  let stepReasoningBuf = '';
  const toolCallLabels = new Map<string, string>();
  const collectedToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const modelReqDebug = createTextDebug(
    'MODEL REQUEST',
    `model=${modelLabel}\nmessages=${messages.length}\ntools=${Object.keys(tools).length}\nmaxSteps=${maxSteps}`,
  );

  // Pre-stream fallback emit: guarantees the "请求模型" row exists even for
  // providers that don't emit `start-step`.
  callbacks.onPhase('requesting', '请求模型', modelReqDebug);
  currentPhaseKind = 'requesting';
  requestingEmittedThisStep = true;

  try {
    const result = streamChatWithTools({
      model,
      messages,
      tools,
      maxSteps,
      abortSignal,
    });

    for await (const event of result.fullStream as AsyncIterable<any>) {
      abortSignal?.throwIfAborted();

      switch (event.type) {
        case 'text-delta': {
          const delta = readTextDelta(event);
          if (!delta) break;
          if (currentPhaseKind !== 'answering') {
            callbacks.onPhase('answering', '生成回答');
            currentPhaseKind = 'answering';
          }
          textBuf += delta;
          callbacks.onChunk?.(delta);
          break;
        }

        case 'reasoning-delta': {
          const delta = readTextDelta(event);
          if (delta) {
            if (!reasoningEmittedThisStep) {
              callbacks.onPhase('reasoning', '模型推理中');
              currentPhaseKind = 'reasoning';
              reasoningEmittedThisStep = true;
            }
            stepReasoningBuf += delta;
            callbacks.onPhase(
              'reasoning',
              undefined,
              createTextDebug('REASONING (本步)', stepReasoningBuf),
            );
          }
          break;
        }

        case 'start-step': {
          if (!requestingEmittedThisStep) {
            const label = stepIdx === 0 ? '请求模型' : '请求模型 (继续)';
            const stepDebug = createTextDebug(
              'MODEL REQUEST',
              `model=${modelLabel}\nstep=${stepIdx + 1}\ntools=${Object.keys(tools).length}\n(messages history extended by SDK with previous tool results)`,
            );
            callbacks.onPhase('requesting', label, stepDebug);
            currentPhaseKind = 'requesting';
            requestingEmittedThisStep = true;
          }
          break;
        }

        case 'tool-input-start': {
          const name = (event.toolName ?? '') as string;
          callbacks.onPhase('composingTool', `构造工具调用：${name}`);
          currentPhaseKind = 'composingTool';
          break;
        }

        case 'finish-step': {
          stepReasoningBuf = '';
          stepIdx += 1;
          requestingEmittedThisStep = false;
          reasoningEmittedThisStep = false;
          break;
        }

        case 'tool-call': {
          const name = (event.toolName ?? event.tool_name ?? '') as string;
          const args = (event.input ?? event.args ?? {}) as Record<string, unknown>;
          const label = formatToolLabel(name, args);
          toolCallLabels.set(event.toolCallId ?? event.id ?? name, label);
          if (currentPhaseKind === 'composingTool') {
            callbacks.onPhase(
              'composingTool',
              undefined,
              createTextDebug(
                'TOOL INPUT',
                `tool=${name}\ninput=${JSON.stringify(args, null, 2)}`,
              ),
            );
          }
          callbacks.onPhase('toolCall', label);
          currentPhaseKind = 'toolCall';
          collectedToolCalls.push({ name, args });
          break;
        }

        case 'tool-result':
        case 'tool-call-result': {
          const name = (event.toolName ?? event.tool_name ?? '') as string;
          const args = (event.input ?? event.args ?? {}) as Record<string, unknown>;
          const rawResult = event.output ?? event.result ?? '';
          const resultText = typeof rawResult === 'string'
            ? rawResult
            : (rawResult && typeof rawResult === 'object' && 'message' in rawResult
              ? String((rawResult as any).message)
              : JSON.stringify(rawResult));
          const callId = event.toolCallId ?? event.id ?? name;
          const label = toolCallLabels.get(callId) ?? formatToolLabel(name, args);
          const success = typeof rawResult === 'object' && rawResult !== null && 'success' in rawResult
            ? Boolean((rawResult as any).success)
            : true;
          callbacks.onPhase(
            'toolCall',
            label,
            createToolResultDebug({
              tool: name,
              args,
              result: resultText,
              success,
              toolCallId: callId,
            }),
          );
          callbacks.onToolCall?.({ name, args, result: resultText });
          currentPhaseKind = null;
          break;
        }

        case 'tool-error': {
          const name = (event.toolName ?? '') as string;
          const args = (event.input ?? {}) as Record<string, unknown>;
          const err = event.error;
          const errorMessage = err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : JSON.stringify(err);
          const callId = (event.toolCallId ?? event.id ?? name) as string;
          const label = toolCallLabels.get(callId) ?? formatToolLabel(name, args);
          callbacks.onPhase(
            'toolCall',
            label,
            createToolResultDebug({
              tool: name,
              args,
              result: errorMessage,
              success: false,
              toolCallId: callId,
            }),
            true,
          );
          callbacks.onToolCall?.({ name, args, result: errorMessage });
          currentPhaseKind = null;
          break;
        }

        case 'finish':
          break;

        case 'error':
          throw event.error ?? new Error('SDK error event without payload');

        default:
          break;
      }
    }
  } catch (err) {
    if (isUnsupportedToolsError(err)) {
      throw new Error('当前模型不支持工具调用，请在「设置」页面切换支持 function calling 的模型。');
    }
    throw err;
  }

  return { content: textBuf, toolCalls: collectedToolCalls };
}
