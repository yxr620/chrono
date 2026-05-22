/**
 * Tool Call Engine — AI Assistant 入口
 *
 * 负责构造 AI Assistant 的 system prompt + history，然后委托给
 * `streamingEngine.runStreamingToolCallLoop` 消费 SDK fullStream。
 */

import dayjs from 'dayjs';
import { db } from '../db';
import {
  createLanguageModel,
  type ChatMessage,
  type ModelMessage,
} from './llmClient';
import { actionRegistry } from '../actions';
import { gateway } from '../gateway';
import type { ConfirmationCard } from '../actions';
import {
  createSystemPromptDebug,
  type AssistantDebugInfoPayload,
} from './debugInfo';
import {
  runStreamingToolCallLoop,
  type StreamingToolCallInfo,
} from './streamingEngine';

export type ToolCallInfo = StreamingToolCallInfo;

export interface ToolCallEngineCallbacks {
  onPhase: (
    phase: string,
    detail?: string,
    debugInfo?: AssistantDebugInfoPayload,
    failed?: boolean,
    /** 中间 answering 段正文回填，见 streamingEngine 同名参数。 */
    inlineText?: string,
  ) => void;
  onChunk: (delta: string) => void;
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

export async function runToolCallLoop(
  userQuery: string,
  history: ChatMessage[],
  callbacks: ToolCallEngineCallbacks,
  signal?: AbortSignal,
): Promise<{ content: string }> {
  callbacks.onPhase('preparing', '构建系统提示词');
  const config = await gateway.getAiClientConfig();
  const systemPrompt = await buildSystemPrompt();
  callbacks.onPhase('preparing', undefined, createSystemPromptDebug(systemPrompt));

  const model = createLanguageModel(config);
  const tools = actionRegistry.toSdkTools({
    onConfirmRequired: callbacks.onConfirmRequired,
  });

  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content }) as ModelMessage),
    { role: 'user', content: userQuery },
  ];

  const { content } = await runStreamingToolCallLoop({
    model,
    messages,
    tools,
    callbacks: {
      onPhase: callbacks.onPhase,
      onChunk: callbacks.onChunk,
      onToolCall: callbacks.onToolCall,
    },
    maxSteps: 5,
    abortSignal: signal,
    modelLabel: config.model,
  });

  return { content };
}
