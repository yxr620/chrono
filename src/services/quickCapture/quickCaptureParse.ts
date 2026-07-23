/**
 * Quick Capture 自然语言解析
 * 单次 LLM 调用 → parallel tool_calls(add_entry) → PendingEntry[]
 */

import dayjs from 'dayjs';
import { db, type TimeEntry, type Category, type Goal } from '../db';
import { gateway } from '../gateway';
import { createLanguageModel, type CoreMessage } from '../ai/llmClient';
import { tool, jsonSchema } from 'ai';
import { addEntryAction } from '../actions/write/addEntry';
import { runStreamingToolCallLoop } from '../ai/streamingEngine';
import {
  createSystemPromptDebug,
  createTextDebug,
  type AssistantDebugInfoPayload,
} from '../ai/debugInfo';
import { predictMetadata } from '../metadataPredictor';
import { isEntryCategoryRequired } from '../categoryAssignmentPreference';
import { selectPredictedCategoryId } from '../entryCategoryAssignment';
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
  /** 真实当前时刻 */
  now: Date;
  /** 真实今天的日期 'YYYY-MM-DD' */
  todayDate: string;
  /** 用户当前在 RecordsPage 上选中的日期 'YYYY-MM-DD'（可能 ≠ 今天） */
  pageDate: string;
  categories: Category[];
  /** pageDate 对应的 time 型目标 */
  pageDateGoals: Goal[];
  /** pageDate 当天的所有 entries（按时间升序，仅含已完成的） */
  pageDateEntries: TimeEntry[];
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `pending-${Date.now()}-${counter}`;
}

/**
 * 加载 prompt 上下文
 * @param now 真实当前时刻
 * @param pageDate 用户在浏览的日期；缺省时按今天
 */
export async function loadParseContext(
  now: Date = new Date(),
  pageDate?: string,
): Promise<ParseContext> {
  const todayDate = dayjs(now).format('YYYY-MM-DD');
  const targetDate = pageDate || todayDate;

  const [categories, allGoals, allEntries] = await Promise.all([
    db.categories.toArray(),
    db.goals.toArray(),
    db.entries.toArray(),
  ]);

  const pageDateGoals = allGoals.filter(
    g => !g.deleted && (g.type ?? 'time') !== 'check' && g.date === targetDate,
  );

  const pageDateEntries = allEntries
    .filter(
      e =>
        !e.deleted &&
        e.endTime &&
        dayjs(e.startTime).format('YYYY-MM-DD') === targetDate,
    )
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return {
    now,
    todayDate,
    pageDate: targetDate,
    categories: categories.filter(c => !c.deleted),
    pageDateGoals,
    pageDateEntries,
  };
}

interface DaySlot {
  type: 'existing' | 'gap';
  start: string;  // 'HH:mm'
  end: string;    // 'HH:mm'
  activity?: string;
}

/**
 * 把 pageDate 当天的已有 entries 编织成"已有 + 空隙"的完整时间表
 * 让 AI 一眼看到哪段可填、哪段不能动
 */
function computeDaySchedule(
  pageDateEntries: TimeEntry[],
  pageDate: string,
  now: Date,
  todayDate: string,
): DaySlot[] {
  const slots: DaySlot[] = [];
  let cursor = '00:00';

  for (const e of pageDateEntries) {
    const s = dayjs(e.startTime).format('HH:mm');
    const en = dayjs(e.endTime!).format('HH:mm');
    if (cursor < s) {
      slots.push({ type: 'gap', start: cursor, end: s });
    }
    slots.push({ type: 'existing', start: s, end: en, activity: e.activity });
    cursor = en > cursor ? en : cursor;
  }

  // 当日尾部空隙：今天截到当前时刻，过去的日期截到 24:00
  const tail = pageDate === todayDate ? dayjs(now).format('HH:mm') : '24:00';
  if (cursor < tail) {
    slots.push({ type: 'gap', start: cursor, end: tail });
  }

  return slots;
}

function formatSchedule(slots: DaySlot[]): string {
  if (slots.length === 0) return '（当日无任何记录，全天可补录）';
  return slots
    .map(s =>
      s.type === 'existing'
        ? `${s.start}-${s.end}  ${s.activity}  [已存在]`
        : `${s.start}-${s.end}  ★可补录空隙`,
    )
    .join('\n');
}

function buildSystemPrompt(ctx: ParseContext): string {
  const dowToday = dayjs(ctx.todayDate).format('dddd');
  const dowPage = dayjs(ctx.pageDate).format('dddd');
  const nowHM = dayjs(ctx.now).format('HH:mm');
  const cats = ctx.categories.map(c => c.name).join('、') || '（无）';
  const goals = ctx.pageDateGoals.map(g => g.name).join('、') || '（无）';
  const schedule = formatSchedule(
    computeDaySchedule(ctx.pageDateEntries, ctx.pageDate, ctx.now, ctx.todayDate),
  );

  const isPastDay = ctx.pageDate !== ctx.todayDate;

  return `你是时间记录解析助手。用户会用自然语言描述某天发生的活动，你必须把它拆成多个独立的时间段，每个时间段调用一次 add_entry 工具。

## 时间锚点
- 今天的真实日期：${ctx.todayDate}（${dowToday}），实际当前时间 ${nowHM}
- 用户当前正在浏览：${ctx.pageDate}（${dowPage}）${isPastDay ? '  ← 用户在补录过去的某天' : ''}

## ${ctx.pageDate} 的时间表（含已有记录与可填空隙）
${schedule}

## 可用类别
${cats}

## ${ctx.pageDate} 的目标
${goals}

## 严格规则
1. 必须使用 parallel tool calls，每个时间段调用一次 add_entry，不要在一次调用里塞多条。
2. **date 字段必须等于 ${ctx.pageDate}**，除非用户在文本里明确说了别的日期、或用了"昨晚"、"前天"等指向其他日的相对表达。
3. start_time / end_time 格式 HH:mm（24 小时制）。
4. **时间边界硬规则（极其重要）**：
   - 上面"[已存在]"的时间段是不可侵犯的硬边界。
   - 用户口述的时间（如"11 点"）必须 clamp 到所在的"★可补录空隙"内。例如空隙是 11:19-13:26，"11 点开始"应解读为 11:19 开始（不是 11:00）。
   - 用户描述的某段如果整段落在已有记录内，跳过该段，不要生成 entry。
   - 新建的 entry 必须严格落在某个空隙的 [start, end] 范围内，绝不可越界。
   - 用户如果没说结束时间，根据下一段活动的开始或所在空隙的右边界推断；都无法确定时跳过该段。
5. category 必须从"可用类别"里选，不要新建；不确定就留空。
6. goal 必须从"${ctx.pageDate} 的目标"里选，不要新建；不确定就留空。
7. 用户描述里"刚才"、"现在"按"实际当前时间 ${nowHM}"推断；其他无具体日期的时间默认归到 ${ctx.pageDate}。
8. 不要做任何文字解释，只输出 tool_calls。`;
}

export interface ParseResult {
  entries: PendingEntry[];
  rawTranscript: string;
}

export interface ParseCallbacks {
  onPhase?: (
    phase: string,
    detail?: string,
    debugInfo?: AssistantDebugInfoPayload,
    failed?: boolean,
  ) => void;
}

export async function parseTranscript(
  transcript: string,
  ctx: ParseContext,
  callbacks?: ParseCallbacks,
  signal?: AbortSignal,
): Promise<ParseResult> {
  callbacks?.onPhase?.('preparing', '构建提示词');
  const systemPrompt = buildSystemPrompt(ctx);
  callbacks?.onPhase?.('preparing', undefined, createSystemPromptDebug(systemPrompt));

  const config = await gateway.getAiClientConfig();
  const model = createLanguageModel(config);

  // Inline shim: 不走 registry 的真实 addEntryAction.handler()。
  // 解析阶段只需捕获 LLM 提议的参数，写库在用户 ReviewSequence 确认后才做。
  // 让 execute 总是返回 success，避免任何 tool result 干扰模型（虽然
  // maxSteps:1 已保证模型看不到 tool result，但显式 success 更稳）。
  const tools = {
    add_entry: tool({
      description: addEntryAction.description,
      inputSchema: jsonSchema(addEntryAction.parameters as any),
      execute: async () => ({ success: true, message: 'captured for user review' }),
    }),
  };

  const messages: CoreMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: transcript.trim() },
  ];

  const noopOnPhase = () => {};
  const onPhase = callbacks?.onPhase ?? noopOnPhase;

  const { toolCalls } = await runStreamingToolCallLoop({
    model,
    messages,
    tools,
    callbacks: { onPhase },
    maxSteps: 1,
    abortSignal: signal,
    modelLabel: config.model,
  });

  const entries: PendingEntry[] = [];
  for (const call of toolCalls) {
    if (call.name !== 'add_entry') continue;
    const params = call.args as unknown as AddEntryParams;
    if (!params.date || !params.start_time || !params.end_time || !params.activity) {
      continue;
    }

    const startDate = dayjs(`${params.date} ${params.start_time}`).toDate();
    const endDate = dayjs(`${params.date} ${params.end_time}`).toDate();
    const conflicts =
      isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate
        ? []
        : detectConflicts(startDate, endDate, ctx.pageDateEntries);

    entries.push({
      id: genId(),
      params,
      conflicts,
      status: 'pending',
    });
  }

  // 保留 AI 已解析出的有效 Category；只有缺失或无效时才用本地历史补全。
  // Goal 仍只允许高置信度本地结果覆盖 AI 字段。
  callbacks?.onPhase?.('enriching', '本地补全 category/goal');
  await Promise.all(
    entries.map(async entry => {
      try {
        const local = await predictMetadata(entry.params.activity, ctx.pageDateGoals);

        const parsedCategoryName = entry.params.category?.toLowerCase();
        const parsedCategory = parsedCategoryName
          ? ctx.categories.find(category =>
              category.name.toLowerCase().includes(parsedCategoryName)
            )
          : undefined;

        if (!parsedCategory) {
          const categoryId = selectPredictedCategoryId(
            local,
            isEntryCategoryRequired(),
          );
          const cat = ctx.categories.find(category => category.id === categoryId);
          if (cat) entry.params.category = cat.name;
        }

        if (local.goal.confidence === 'high' && local.goal.id) {
          const goal = ctx.pageDateGoals.find(g => g.id === local.goal.id);
          if (goal) entry.params.goal = goal.name;
        }
      } catch {
        // 预测失败不阻塞解析；AI 的字段原样保留
      }
    }),
  );
  callbacks?.onPhase?.(
    'enriching',
    undefined,
    createTextDebug(
      'ENRICH',
      `entries=${entries.length}\nCategory 在必选模式采用最佳本地候选，在可选模式仅采用高置信度候选；有效 AI Category 保留。Goal 仍仅采用高置信度本地预测。`,
    ),
  );

  return { entries, rawTranscript: transcript };
}
