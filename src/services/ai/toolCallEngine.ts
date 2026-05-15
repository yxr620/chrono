/**
 * 工具调用循环引擎
 *
 * 阶段设计（每个阶段对应 UI/CLI 中的一行指示器）：
 *
 *   [preparing]  构建 system prompt（纯本地，无模型调用）
 *   [thinking]   非流式调用 LLM（带 tools 声明）
 *     ├─ 返回 tool_calls → 进入 [toolCall] 本地执行 → 结果回填 → 回到 [thinking]
 *     ├─ 返回文本内容   → 直接输出，流程结束（无额外 answering 阶段）
 *     └─ 返回空 / 异常  → 跳到 [answering]
 *   [toolCall]   本地执行工具函数（查询 IndexedDB 等）
 *   [answering]  流式调用 LLM 兜底（仅当 thinking 循环未产出文本时触发）
 *
 * 关键原则：一次模型调用 = 一个阶段。
 * thinking 阶段的模型调用如果直接返回了回答，就不会产生 answering 阶段，
 * 避免「同一内容看起来经历了两个阶段」的困惑。
 */

import dayjs from 'dayjs';
import { db } from '../db';
import { chatWithTools, chatStream, type ChatMessage } from './llmClient';
import { actionRegistry } from '../actions';
import { gateway } from '../gateway';
import type { ConfirmationCard } from '../actions';

const MAX_TOOL_ROUNDS = 5;

export interface ToolCallInfo {
    name: string;
    args: Record<string, unknown>;
    result: string;
}

export interface ToolCallEngineCallbacks {
    onPhase: (phase: string, detail?: string, debugInfo?: string) => void;
    onChunk: (delta: string) => void;
    onThinking?: (delta: string) => void;
    onToolCall?: (info: ToolCallInfo) => void;
    onConfirmRequired?: (card: ConfirmationCard) => Promise<boolean>;
}

/**
 * 构建轻量 system prompt（不含数据，数据由工具调用按需获取）
 */
async function buildSystemPrompt(): Promise<string> {
    const today = dayjs().format('YYYY-MM-DD（dddd）');

    // 预加载类别列表，让 LLM 了解可用的筛选维度
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

/**
 * 主入口：执行工具调用循环
 */
export async function runToolCallLoop(
    userQuery: string,
    history: ChatMessage[],
    callbacks: ToolCallEngineCallbacks,
    signal?: AbortSignal,
): Promise<{ content: string; thinking?: string }> {
    // 1. 构建 system prompt
    callbacks.onPhase('preparing', '构建上下文');
    const config = await gateway.getAiClientConfig();
    const systemPrompt = await buildSystemPrompt();
    // 准备完毕后，补充 debugInfo
    callbacks.onPhase('preparing', undefined, systemPrompt);

    // 组装消息列表（system + 历史 + 当前问题）
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userQuery },
    ];

    // 2. 工具调用循环
    let round = 0;
    while (round < MAX_TOOL_ROUNDS) {
        round++;
        signal?.throwIfAborted();

        // 将当前发送给模型的消息列表作为 debugInfo
        const thinkingLabel = round === 1 ? '分析问题' : '综合分析';
        const thinkingDebug = formatMessagesDebug(messages);
        callbacks.onPhase('thinking', thinkingLabel, thinkingDebug);

        try {
            // 非流式调用（带 tools）
            const toolDefs = actionRegistry.toToolDefinitions();
            const response = await chatWithTools(config, messages, toolDefs, signal);

            // 没有 tool_calls → 本轮 thinking 的模型调用已经给出了最终回答
            if (!response.tool_calls || response.tool_calls.length === 0) {
                if (response.content) {
                    // 内容由本轮 thinking 直接产出，无需额外 answering 阶段
                    if (response.thinking) {
                        callbacks.onThinking?.(response.thinking);
                    }
                    callbacks.onChunk(response.content);
                    return { content: response.content, thinking: response.thinking };
                }
                // 空内容 → 跳出循环，由下方 answering 兜底流式生成
                break;
            }

            // 有 tool_calls → 执行工具
            // 将 assistant 的 tool_calls 消息加入历史
            messages.push({
                role: 'assistant',
                content: response.content || '',
                tool_calls: response.tool_calls,
            } as any);

            // 逐个执行工具
            for (const tc of response.tool_calls) {
                signal?.throwIfAborted();

                let args: Record<string, unknown> = {};
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {
                    args = {};
                }

                const action = actionRegistry.get(tc.function.name);
                if (!action) {
                    messages.push({
                        role: 'tool',
                        content: `未知工具: ${tc.function.name}`,
                        tool_call_id: tc.id,
                    } as any);
                    continue;
                }

                const toolLabel = formatToolLabel(tc.function.name, args);
                callbacks.onPhase('toolCall', toolLabel);

                // 写入/维护操作需要用户确认
                if (action.risk !== 'none') {
                    if (!callbacks.onConfirmRequired) {
                        // 调用方未提供确认机制——硬拒绝，绝不静默执行
                        const toolDebug = JSON.stringify({ tool: tc.function.name, args, result: '调用方未提供确认机制' }, null, 2);
                        callbacks.onPhase('toolCall', toolLabel + '（已拒绝：无确认机制）', toolDebug);
                        messages.push({
                            role: 'tool',
                            content: `已拒绝执行高风险操作 ${tc.function.name}：调用方未提供用户确认机制。`,
                            tool_call_id: tc.id,
                        } as any);
                        continue;
                    }

                    const card = action.confirm
                        ? await action.confirm(args)
                        : {
                            title: action.description,
                            description: JSON.stringify(args, null, 2),
                            changes: [],
                            risk: action.risk,
                        };

                    const confirmed = await callbacks.onConfirmRequired(card);
                    // 确认期间用户可能按下了停止——立刻退出
                    signal?.throwIfAborted();
                    if (!confirmed) {
                        const toolDebug = JSON.stringify({ tool: tc.function.name, args, result: '用户取消' }, null, 2);
                        callbacks.onPhase('toolCall', toolLabel + '（已取消）', toolDebug);
                        messages.push({
                            role: 'tool',
                            content: '用户取消了此操作。',
                            tool_call_id: tc.id,
                        } as any);
                        continue;
                    }
                }

                let result: { success: boolean; message: string };
                try {
                    result = await action.handler(args);
                } catch (handlerErr: unknown) {
                    // handler 抛错——构造失败结果让 LLM 知道，避免连累同轮已成功的 tool
                    const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
                    result = { success: false, message: `工具执行异常：${errMsg}` };
                }

                // 构建工具调用的详细调试信息
                const toolDebug = JSON.stringify({ tool: tc.function.name, args, result: result.message }, null, 2);
                callbacks.onPhase('toolCall', toolLabel, toolDebug);

                // 通知 UI
                callbacks.onToolCall?.({
                    name: tc.function.name,
                    args,
                    result: result.message,
                });

                // 将工具结果以 role: 'tool' 追加
                messages.push({
                    role: 'tool',
                    content: result.message,
                    tool_call_id: tc.id,
                } as any);
            }
        } catch (err: any) {
            // function calling 不支持 → 跳出循环，由 answering 兜底
            if (isFunctionCallingUnsupported(err)) {
                callbacks.onPhase('thinking', thinkingLabel + '（不支持工具调用，切换为直接对话）');
                break;
            }
            throw err;
        }
    }

    // 3. 兜底：流式输出（仅当 thinking 循环未产出内容时到达此处）
    const answeringDebug = formatMessagesDebug(messages);
    callbacks.onPhase('answering', '流式生成', answeringDebug);
    signal?.throwIfAborted();

    let accumulated = '';
    let thinkingAccum = '';

    await chatStream(
        config,
        messages,
        (delta) => {
            accumulated += delta;
            callbacks.onChunk(delta);
        },
        signal,
        (thinkingDelta) => {
            thinkingAccum += thinkingDelta;
            callbacks.onThinking?.(thinkingDelta);
        },
    );

    return { content: accumulated, thinking: thinkingAccum || undefined };
}

/**
 * 为工具调用生成可读标签
 */
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
            if (action) {
                return action.description.slice(0, 30);
            }
            return name;
        }
    }
}

/**
 * 格式化消息列表为可读的调试文本
 */
function formatMessagesDebug(messages: ChatMessage[]): string {
    return messages.map((m, i) => {
        const msg = m as any;
        const role = msg.role.toUpperCase();
        const parts: string[] = [];

        // 主内容
        const content = msg.content || '';
        if (content) {
            const display = content.length > 2000
                ? content.slice(0, 2000) + `\n... (${content.length} chars total)`
                : content;
            parts.push(display);
        }

        // assistant 的 tool_calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const calls = msg.tool_calls.map((tc: any) => {
                const name = tc.function?.name || 'unknown';
                let argsStr = tc.function?.arguments || '{}';
                try { argsStr = JSON.stringify(JSON.parse(argsStr), null, 2); } catch { /* keep raw */ }
                return `  → ${name}(${argsStr})`;
            }).join('\n');
            parts.push(`[tool_calls]\n${calls}`);
        }

        // tool 消息的 tool_call_id
        const suffix = msg.tool_call_id ? ` (tool_call_id: ${msg.tool_call_id})` : '';

        return `── [${i + 1}] ${role}${suffix} ──\n${parts.join('\n') || '(empty)'}`;
    }).join('\n\n');
}

/**
 * 检测 API 是否明确告知"不支持 function calling / tools"
 *
 * 之前只用 includes('function')/('tools')/('not supported') 太激进，
 * 任何带"function timeout"/"cloud function ..."/"feature not supported"
 * 的错误都会被误判成"不支持工具"，从而跳到无 tools 的 answering 兜底，
 * 让模型基于不完整数据编造答案。
 *
 * 这里改用更具体的短语集合，匹配主流 provider 的实际错误文案。
 */
function isFunctionCallingUnsupported(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : '').toLowerCase();
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
