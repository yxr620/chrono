/**
 * Quick Capture 自然语言解析
 * 单次 LLM 调用 → parallel tool_calls(add_entry) → PendingEntry[]
 */

import dayjs from 'dayjs';
import { db, type TimeEntry, type Category, type Goal } from '../db';
import { gateway } from '../gateway';
import { chatWithTools, type ChatMessage } from '../ai/llmClient';
import { actionRegistry } from '../actions';
import { detectConflicts, type ConflictInfo } from './conflictDetection';

export interface AddEntryParams {
  date: string;          // 'YYYY-MM-DD'
  start_time: string;    // 'HH:mm'
  end_time: string;      // 'HH:mm'
  activity: string;
  category?: string;
  goal?: string;
}

export interface PendingEntry {
  id: string;
  params: AddEntryParams;
  conflicts: ConflictInfo[];
  status: 'pending' | 'saving' | 'saved' | 'skipped' | 'failed';
  error?: string;
}

export interface ParseContext {
  now: Date;
  todayDate: string;
  categories: Category[];
  todayGoals: Goal[];
  recentEntries: TimeEntry[];
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `pending-${Date.now()}-${counter}`;
}

/** 加载 prompt 上下文（今天日期 / 类别 / 今日目标 / 最近 24h entries） */
export async function loadParseContext(now: Date = new Date()): Promise<ParseContext> {
  const todayDate = dayjs(now).format('YYYY-MM-DD');
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [categories, allGoals, allEntries] = await Promise.all([
    db.categories.toArray(),
    db.goals.toArray(),
    db.entries.toArray(),
  ]);

  const todayGoals = allGoals.filter(
    g => !g.deleted && (g.type ?? 'time') !== 'check' && g.date === todayDate,
  );

  const recentEntries = allEntries
    .filter(e => !e.deleted && e.endTime && new Date(e.startTime) >= dayAgo)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return { now, todayDate, categories: categories.filter(c => !c.deleted), todayGoals, recentEntries };
}

function buildSystemPrompt(ctx: ParseContext): string {
  const dow = dayjs(ctx.now).format('dddd');
  const nowHM = dayjs(ctx.now).format('HH:mm');
  const cats = ctx.categories.map(c => c.name).join('、') || '（无）';
  const goals = ctx.todayGoals.map(g => g.name).join('、') || '（无）';

  const recentLines = ctx.recentEntries
    .slice(-30)
    .map(e => {
      const d = dayjs(e.startTime).format('MM-DD');
      const s = dayjs(e.startTime).format('HH:mm');
      const en = dayjs(e.endTime!).format('HH:mm');
      return `- ${d} ${s}-${en} ${e.activity}`;
    })
    .join('\n') || '（无）';

  return `你是时间记录解析助手。用户会用自然语言描述过去几小时的活动，你必须把它拆成多个独立的时间段，每个时间段调用一次 add_entry 工具。

## 当前时间
今天是 ${ctx.todayDate}（${dow}），现在 ${nowHM}。

## 可用类别
${cats}

## 今天的目标
${goals}

## 最近 24 小时已存在的记录（请避开这些时间段）
${recentLines}

## 严格规则
1. 必须使用 parallel tool calls，每个时间段调用一次 add_entry，不要在一次调用里塞多条。
2. date 字段格式 YYYY-MM-DD。如果用户没明确日期，按今天。如果"今天 HH:mm"在未来，回退为昨天。
3. start_time/end_time 格式 HH:mm（24 小时制）。
4. category 必须从"可用类别"里选，不要新建；不确定就留空。
5. goal 必须从"今天的目标"里选，不要新建；不确定就留空。
6. 没有明确结束时间的活动，根据下一段活动的开始时间推断；都无法确定时跳过该段（不调用工具）。
7. 用户描述里出现的相对表达（"昨晚"、"上午"、"刚才"）按当前时间推断。
8. 不要做任何文字解释，只输出 tool_calls。`;
}

export interface ParseResult {
  entries: PendingEntry[];
  rawTranscript: string;
}

export async function parseTranscript(
  transcript: string,
  ctx: ParseContext,
  signal?: AbortSignal,
): Promise<ParseResult> {
  const config = await gateway.getAiClientConfig();
  const tools = actionRegistry.toToolDefinitionsFor(['add_entry']);

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    { role: 'user', content: transcript.trim() },
  ];

  const response = await chatWithTools(config, messages, tools, signal);
  const calls = response.tool_calls ?? [];

  const entries: PendingEntry[] = [];
  for (const call of calls) {
    if (call.function.name !== 'add_entry') continue;
    let params: AddEntryParams;
    try {
      params = JSON.parse(call.function.arguments) as AddEntryParams;
    } catch {
      continue;
    }
    if (!params.date || !params.start_time || !params.end_time || !params.activity) {
      continue;
    }

    const startDate = dayjs(`${params.date} ${params.start_time}`).toDate();
    const endDate = dayjs(`${params.date} ${params.end_time}`).toDate();
    const conflicts =
      isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate
        ? []
        : detectConflicts(startDate, endDate, ctx.recentEntries);

    entries.push({
      id: genId(),
      params,
      conflicts,
      status: 'pending',
    });
  }

  return { entries, rawTranscript: transcript };
}
