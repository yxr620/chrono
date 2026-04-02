/**
 * @deprecated 工具定义已迁移至 src/services/actions/。
 * 本文件保留以供参考和类型导出（ToolDefinition），不再被 toolCallEngine 使用。
 * 所有新工具应添加到 src/services/actions/ 目录。
 *
 * 原始说明：
 * AI 工具定义 — 定义 LLM 可调用的工具（Function Calling）及其本地执行函数
 * 所有工具在浏览器本地执行，直接访问 IndexedDB
 */

import dayjs from 'dayjs';
import { db } from '../db';
import { dataService } from '../dataService';
import { loadRawData, processEntries, formatDuration } from '../analysis/processor';

// ── OpenAI tools 格式的工具声明 ──────────────────────────────────────────

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'query_time_entries',
            description:
                '查询用户的时间记录数据。可按时间范围、类别、目标进行筛选，返回统计摘要和详细记录。每次查询最多返回 200 条记录。',
            parameters: {
                type: 'object',
                properties: {
                    start_date: {
                        type: 'string',
                        description: '起始日期，格式 YYYY-MM-DD',
                    },
                    end_date: {
                        type: 'string',
                        description: '结束日期，格式 YYYY-MM-DD',
                    },
                    category: {
                        type: 'string',
                        description: '可选，按类别名称筛选（如 "学习", "工作", "运动"）',
                    },
                    goal: {
                        type: 'string',
                        description: '可选，按目标名称筛选',
                    },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_categories',
            description: '获取用户已有的所有活动类别列表（如 学习、工作、运动 等）',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_goals',
            description: '获取指定日期范围内用户设定的目标列表',
            parameters: {
                type: 'object',
                properties: {
                    start_date: {
                        type: 'string',
                        description: '起始日期，格式 YYYY-MM-DD',
                    },
                    end_date: {
                        type: 'string',
                        description: '结束日期，格式 YYYY-MM-DD',
                    },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
];

// ── 工具执行函数 ─────────────────────────────────────────────────────────

const MAX_ENTRIES = 200;

/**
 * 工具路由：根据工具名分发执行
 * @returns 工具执行结果的文本表示
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<string> {
    switch (name) {
        case 'query_time_entries':
            return await queryTimeEntries(args);
        case 'list_categories':
            return await listCategories();
        case 'list_goals':
            return await listGoals(args);
        default:
            return `未知工具: ${name}`;
    }
}

/**
 * 查询时间记录
 * 支持按时间范围、类别名称、目标名称筛选
 */
async function queryTimeEntries(args: Record<string, unknown>): Promise<string> {
    const startDate = new Date(args.start_date as string);
    const endDate = new Date(args.end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return '错误：无效的日期格式，请使用 YYYY-MM-DD';
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // 加载所有类别和目标用于名称匹配
    const allCategories = await db.categories.toArray();
    const allGoals = await db.goals.toArray();

    // 名称 → ID 映射（模糊匹配）
    let categoryIds: string[] | undefined;
    if (args.category) {
        const catName = (args.category as string).toLowerCase();
        const matched = allCategories.filter(c =>
            c.name.toLowerCase().includes(catName),
        );
        if (matched.length > 0) {
            categoryIds = matched.map(c => c.id);
        } else {
            return `未找到类别 "${args.category}"。可用类别：${allCategories.map(c => c.name).join(', ')}`;
        }
    }

    let goalIds: string[] | undefined;
    if (args.goal) {
        const goalName = (args.goal as string).toLowerCase();
        const matched = allGoals.filter(g =>
            g.name.toLowerCase().includes(goalName),
        );
        if (matched.length > 0) {
            goalIds = matched.map(g => g.id!);
        } else {
            return `未找到目标 "${args.goal}"。`;
        }
    }

    // 查询数据
    const { entries: rawEntries, goals, categories } = await loadRawData({
        dateRange: { start: startDate, end: endDate },
        goalIds,
        categoryIds,
    });

    const processed = processEntries(rawEntries, goals, categories);

    if (processed.length === 0) {
        const rangeLabel = `${dayjs(startDate).format('YYYY-MM-DD')} 至 ${dayjs(endDate).format('YYYY-MM-DD')}`;
        const filterDesc = [
            args.category ? `类别="${args.category}"` : '',
            args.goal ? `目标="${args.goal}"` : '',
        ].filter(Boolean).join(', ');
        return `${rangeLabel} 范围内${filterDesc ? `（${filterDesc}）` : ''}没有找到记录。`;
    }

    // 排序
    const sorted = [...processed].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    // 截断
    const truncated = sorted.length > MAX_ENTRIES;
    const display = truncated ? sorted.slice(-MAX_ENTRIES) : sorted;

    // 统计
    const totalMinutes = processed.reduce((s, e) => s + e.duration, 0);

    const categoryAgg: Record<string, number> = {};
    const goalAgg: Record<string, number> = {};
    processed.forEach(e => {
        categoryAgg[e.categoryName] = (categoryAgg[e.categoryName] || 0) + e.duration;
        goalAgg[e.goalName] = (goalAgg[e.goalName] || 0) + e.duration;
    });

    const categoryStats = Object.entries(categoryAgg)
        .sort((a, b) => b[1] - a[1])
        .map(([name, min]) => `${name}: ${formatDuration(min)}`)
        .join(', ');

    const goalStats = Object.entries(goalAgg)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, min]) => `${name}: ${formatDuration(min)}`)
        .join(', ');

    // 详细记录
    const entriesText = display
        .map(e => {
            const start = dayjs(e.startTime).format('MM-DD HH:mm');
            const end = dayjs(e.endTime).format('HH:mm');
            return `${start}~${end} | ${e.activity} | ${e.categoryName} | ${e.goalName} | ${formatDuration(e.duration)}`;
        })
        .join('\n');

    const rangeLabel = `${dayjs(startDate).format('YYYY-MM-DD')} 至 ${dayjs(endDate).format('YYYY-MM-DD')}`;

    return `## 查询结果：${rangeLabel}
${args.category ? `筛选类别：${args.category}\n` : ''}${args.goal ? `筛选目标：${args.goal}\n` : ''}
### 统计摘要
- 记录数：${processed.length} 条${truncated ? `（仅展示最近 ${MAX_ENTRIES} 条详情）` : ''}
- 总时长：${formatDuration(totalMinutes)}
- 类别分布：${categoryStats || '无'}
- 目标分布（Top 10）：${goalStats || '无'}

### 详细记录
日期时间 | 活动 | 类别 | 目标 | 时长
${entriesText}`;
}

/**
 * 列出所有类别
 */
async function listCategories(): Promise<string> {
    const categories = await dataService.categories.list();
    if (categories.length === 0) return '当前没有任何类别。';
    return `可用类别：\n${categories.map(c => `- ${c.name}`).join('\n')}`;
}

/**
 * 列出指定日期范围的目标
 */
async function listGoals(args: Record<string, unknown>): Promise<string> {
    const startDate = args.start_date as string;
    const endDate = args.end_date as string;

    if (!startDate || !endDate) {
        return '错误：需要提供 start_date 和 end_date 参数';
    }

    const filtered = await dataService.goals.query({
        startDate,
        endDate,
    });

    if (filtered.length === 0) {
        return `${startDate} 至 ${endDate} 范围内没有设定目标。`;
    }

    // 按日期分组
    const byDate: Record<string, string[]> = {};
    filtered.forEach(g => {
        if (!byDate[g.date]) byDate[g.date] = [];
        byDate[g.date].push(g.name);
    });

    const lines = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, names]) => `${date}: ${names.join(', ')}`)
        .join('\n');

    return `目标列表（${startDate} 至 ${endDate}）：\n${lines}`;
}
