/**
 * Tool Call Engine — translates Vercel AI SDK `fullStream` events into the
 * Chrono UI's phase / chunk / thinking / toolCall callbacks.
 *
 * The SDK handles the actual round-loop (maxSteps); we only:
 *   1. build the system prompt + initial messages
 *   2. expose actions as SDK tools (with confirmation gating)
 *   3. consume `result.fullStream` and dispatch UI events
 *
 * Phase mapping:
 *   - preparing  : while we build the system prompt (synchronous, no model call)
 *   - thinking   : streaming model output before any tool call
 *   - toolCall   : one phase per tool-call event; updated when tool-result arrives
 *   - answering  : streaming model output after a tool result
 *
 * SDK v5 event field notes:
 *   - text-delta      → { type: 'text-delta', text: string }
 *   - reasoning-delta → { type: 'reasoning-delta', text: string }
 *   - tool-call       → { type: 'tool-call', toolName, toolCallId, input }
 *   - tool-result     → { type: 'tool-result', toolName, toolCallId, input, output }
 */

import dayjs from 'dayjs';
import { db } from '../db';
import {
  createLanguageModel,
  streamChatWithTools,
  isUnsupportedToolsError,
  type ChatMessage,
  type CoreMessage,
} from './llmClient';
import { actionRegistry } from '../actions';
import { gateway } from '../gateway';
import type { ConfirmationCard } from '../actions';
import {
  createSystemPromptDebug,
  createToolResultDebug,
  createTextDebug,
  type AssistantDebugInfoPayload,
} from './debugInfo';

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ToolCallEngineCallbacks {
  onPhase: (phase: string, detail?: string, debugInfo?: AssistantDebugInfoPayload) => void;
  onChunk: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (info: ToolCallInfo) => void;
  onConfirmRequired?: (card: ConfirmationCard) => Promise<boolean>;
}

async function buildSystemPrompt(): Promise<string> {
  const today = dayjs().format('YYYY-MM-DD（dddd）');
  const categories = await db.categories.toArray();
  const categoryList = categories
    .filter(c => !(c as any).deleted)
    .map(c => c.name)
    .join(', ');

  let prompt = `你是用户的个人时间管理助手。你可以通过工具函数查询和管理用户的时间记录数据。

## 当前日期
${today}

## 用户的活动类别
${categoryList || '（暂无类别）'}

## 工具使用指南
1. 用户询问时间相关问题时，使用 query_time_entries 工具查询数据
2. 如果用户的问题涉及多个时间段（如"1月和2月"），请分别查询每个时间段
3. 如果需要按类别或目标筛选，使用对应的筛选参数
4. 如果不确定用户有哪些目标，先用 list_goals 查询

## 回答规则
1. 用中文回答，语气自然简洁
2. 时长用"X小时Y分钟"格式
3. 给出有洞察的总结和分析，不要只是复述数据
4. 数据为空时如实告知
5. 如果用户的问题与时间记录无关，礼貌地引导回时间管理话题
6. 当用户请求"报告"或"总结"时，按以下结构组织回答：
   a) **时间分配摘要**：各类别时间占比、与往期对比
   b) **目标回顾**：投入最多的目标、连续坚持的目标
   c) **洞察与发现**：值得注意的行为模式、作息规律变化、改进建议`;

  const writeToolsExist = actionRegistry.getByCategory('write').length > 0
    || actionRegistry.getByCategory('maintenance').length > 0;

  if (writeToolsExist) {
    prompt += `\n\n## 操作工具使用指南
1. 当用户明确要求新增/修改/删除记录时，使用对应的写入工具
2. 在使用写入工具之前，先用查询工具确认操作对象（如 "删除那条记录" → 先查询找到具体记录）
3. 合并记录时，先查询要合并的记录列表，确认后调用 merge_entries
4. 数据维护操作应先诊断（find_overlaps/find_anomalies），再提出修复建议
5. 不要在用户未请求时主动修改数据
6. 写入操作会触发用户确认弹窗，用户可能会取消——如果取消了，尊重用户决定`;
  }

  return prompt;
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
    default: {
      const action = actionRegistry.get(name);
      if (action) return action.description.slice(0, 30);
      return name;
    }
  }
}

/** Pull text out of an SDK text-delta event.
 *  SDK v5 fullStream text-delta uses `text`; legacy shapes used `textDelta`. */
function readTextDelta(ev: any): string {
  return typeof ev.textDelta === 'string'
    ? ev.textDelta
    : typeof ev.text === 'string'
      ? ev.text
      : '';
}

export async function runToolCallLoop(
  userQuery: string,
  history: ChatMessage[],
  callbacks: ToolCallEngineCallbacks,
  signal?: AbortSignal,
): Promise<{ content: string; thinking?: string }> {
  // 1. Preparing
  callbacks.onPhase('preparing', '构建系统提示词');
  const config = await gateway.getAiClientConfig();
  const systemPrompt = await buildSystemPrompt();
  callbacks.onPhase('preparing', undefined, createSystemPromptDebug(systemPrompt));

  const model = createLanguageModel(config);
  const tools = actionRegistry.toSdkTools({
    onConfirmRequired: callbacks.onConfirmRequired,
  });

  const messages: CoreMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content }) as CoreMessage),
    { role: 'user', content: userQuery },
  ];

  callbacks.onPhase(
    'thinking',
    '分析问题',
    createTextDebug('MODEL REQUEST', `model=${config.model}\nmessages=${messages.length}\ntools=${Object.keys(tools).length}`),
  );

  let currentPhaseKind: 'thinking' | 'toolCall' | 'answering' | null = 'thinking';
  let textBuf = '';
  let thinkBuf = '';
  const toolCallLabels = new Map<string, string>(); // toolCallId → label for tool-result lookup

  try {
    const result = streamChatWithTools({
      model,
      messages,
      tools,
      maxSteps: 5,
      abortSignal: signal,
    });

    for await (const event of result.fullStream as AsyncIterable<any>) {
      signal?.throwIfAborted();

      switch (event.type) {
        case 'text-delta': {
          // SDK v5 fullStream text-delta: { type, id, text: string }
          const delta = readTextDelta(event);
          if (!delta) break;
          if (currentPhaseKind === null || currentPhaseKind === 'toolCall') {
            callbacks.onPhase('answering', '生成回答');
            currentPhaseKind = 'answering';
          }
          textBuf += delta;
          callbacks.onChunk(delta);
          break;
        }

        case 'reasoning-delta': {
          // SDK v5 fullStream reasoning-delta: { type, id, text: string }
          const delta = readTextDelta(event);
          if (delta) {
            thinkBuf += delta;
            callbacks.onThinking?.(delta);
          }
          break;
        }

        case 'tool-call': {
          // SDK v5 fullStream tool-call: { type, toolCallId, toolName, input }
          const name = (event.toolName ?? event.tool_name ?? '') as string;
          const args = (event.input ?? event.args ?? {}) as Record<string, unknown>;
          const label = formatToolLabel(name, args);
          toolCallLabels.set(event.toolCallId ?? event.id ?? name, label);
          callbacks.onPhase('toolCall', label);
          currentPhaseKind = 'toolCall';
          break;
        }

        case 'tool-result':
        case 'tool-call-result': {
          // SDK v5 fullStream tool-result: { type, toolCallId, toolName, input, output }
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

        case 'finish': {
          // Final phase finalisation happens via markFinalPhaseEnded at the
          // caller (AIAssistant.tsx); nothing to do here.
          break;
        }

        case 'error': {
          throw event.error ?? new Error('SDK error event without payload');
        }

        // Ignore tool-call-delta (the SDK accumulates args itself), step-start,
        // step-finish, reasoning-start, reasoning-end, text-start, text-end,
        // tool-input-start, tool-input-delta, tool-input-end, etc. — they are
        // not meaningful for our phase UI.
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

  return { content: textBuf, thinking: thinkBuf || undefined };
}
