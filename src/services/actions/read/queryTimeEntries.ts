/**
 * Action: query_time_entries
 * 查询用户的时间记录数据，支持按时间范围、类别、目标筛选
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { loadRawData, processEntries, formatDuration } from '../../analysis/processor';
import type { ActionDefinition } from '../types';

const DEFAULT_DETAIL_LIMIT = 200;
const MAX_DETAIL_LIMIT = 500;
const DETAIL_ORDER = 'start_time_asc';

function readBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatPageRange(offset: number, returned: number, total: number): string {
  if (returned <= 0) return `未返回明细 / 共 ${total} 条`;
  return `第 ${offset + 1}-${offset + returned} 条 / 共 ${total} 条`;
}

export const queryTimeEntriesAction: ActionDefinition = {
  name: 'query_time_entries',
  description:
    '查询用户的时间记录数据。可按时间范围、类别、目标进行筛选，返回基于完整匹配结果的统计摘要，并可分页返回详细记录。默认展示最近 200 条详情；需要完整明细时使用 offset=0、limit 分页继续查询。',
  category: 'read',
  risk: 'none',
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
      limit: {
        type: 'number',
        description: `可选，单页详细记录上限，默认 ${DEFAULT_DETAIL_LIMIT}，最大 ${MAX_DETAIL_LIMIT}`,
      },
      offset: {
        type: 'number',
        description:
          '可选，详细记录分页偏移量，从 0 开始，按 start_time_asc 时间正序计数。需要完整明细时从 offset=0 开始，并按 next_offset/previous_offset 继续查询。',
      },
      include_details: {
        type: 'boolean',
        description:
          '可选，是否返回详细记录。默认 true；做总结/报告且不需要逐条明细时可设为 false 以减少上下文。',
      },
    },
    required: ['start_date', 'end_date'],
  },

  handler: async (params) => {
    const startDate = new Date(params.start_date as string);
    const endDate = new Date(params.end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { success: true, message: '错误：无效的日期格式，请使用 YYYY-MM-DD' };
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // 加载所有类别和目标用于名称匹配
    const allCategories = await db.categories.toArray();
    const allGoals = await db.goals.toArray();

    // 名称 → ID 映射（模糊匹配）
    let categoryIds: string[] | undefined;
    if (params.category) {
      const catName = (params.category as string).toLowerCase();
      const matched = allCategories.filter(c =>
        c.name.toLowerCase().includes(catName),
      );
      if (matched.length > 0) {
        categoryIds = matched.map(c => c.id);
      } else {
        return {
          success: true,
          message: `未找到类别 "${params.category}"。可用类别：${allCategories.map(c => c.name).join(', ')}`,
        };
      }
    }

    let goalIds: string[] | undefined;
    if (params.goal) {
      const goalName = (params.goal as string).toLowerCase();
      const matched = allGoals.filter(g =>
        g.name.toLowerCase().includes(goalName),
      );
      if (matched.length > 0) {
        goalIds = matched.map(g => g.id!);
      } else {
        return { success: true, message: `未找到目标 "${params.goal}"。` };
      }
    }

    // 查询数据
    const { entries: rawEntries, goals, categories } = await loadRawData({
      dateRange: { start: startDate, end: endDate },
      goalIds,
      categoryIds,
    });

    const processed = processEntries(rawEntries, goals, categories, { start: startDate, end: endDate });

    if (processed.length === 0) {
      const rangeLabel = `${dayjs(startDate).format('YYYY-MM-DD')} 至 ${dayjs(endDate).format('YYYY-MM-DD')}`;
      const filterDesc = [
        params.category ? `类别="${params.category}"` : '',
        params.goal ? `目标="${params.goal}"` : '',
      ].filter(Boolean).join(', ');
      return {
        success: true,
        message: `${rangeLabel} 范围内${filterDesc ? `（${filterDesc}）` : ''}没有找到记录。`,
      };
    }

    // 排序
    const sorted = [...processed].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    // 详细记录分页。未显式指定 offset 时保留旧行为：展示最近一页。
    const includeDetails = params.include_details !== false;
    const limit = readBoundedInteger(params.limit, DEFAULT_DETAIL_LIMIT, 1, MAX_DETAIL_LIMIT);
    const requestedOffset = readBoundedInteger(params.offset, 0, 0, sorted.length);
    const offset = params.offset === undefined
      ? Math.max(0, sorted.length - limit)
      : requestedOffset;
    const display = includeDetails ? sorted.slice(offset, offset + limit) : [];
    const returned = display.length;
    const hasMore = includeDetails && offset + returned < sorted.length;
    const hasPrevious = includeDetails && offset > 0;
    const nextOffset = hasMore ? offset + returned : null;
    const previousOffset = hasPrevious ? Math.max(0, offset - limit) : null;
    const legacyTruncated = includeDetails && params.offset === undefined && sorted.length > returned;

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

    // 详细记录（带短 ID）
    const detailRows = display
      .map(e => {
        const shortId = e.id.slice(0, 8);
        const start = dayjs(e.startTime).format('MM-DD HH:mm');
        const end = dayjs(e.endTime).format('HH:mm');
        return `${shortId} | ${start}~${end} | ${e.activity} | ${e.categoryName} | ${e.goalName} | ${formatDuration(e.duration)}`;
      })
      .join('\n');

    const rangeLabel = `${dayjs(startDate).format('YYYY-MM-DD')} 至 ${dayjs(endDate).format('YYYY-MM-DD')}`;
    const pageRange = formatPageRange(offset, returned, sorted.length);
    const detailCountNote = !includeDetails
      ? '（本次未返回详细记录）'
      : legacyTruncated
        ? `（仅展示最近 ${returned} 条详情）`
        : returned < sorted.length
          ? `（展示${pageRange}）`
          : '';
    const pagingHint = includeDetails
      ? `- 明细分页：${pageRange}，order=${DETAIL_ORDER}，limit=${limit}，offset=${offset}
- 分页状态：has_previous=${hasPrevious}${previousOffset !== null ? `, previous_offset=${previousOffset}` : ''}；has_more=${hasMore}${nextOffset !== null ? `, next_offset=${nextOffset}` : ''}`
      : `- 明细分页：本次未返回详细记录；如需完整明细，请使用 include_details=true、offset=0、limit<=${MAX_DETAIL_LIMIT} 分页查询`;
    const entriesText = includeDetails && display.length > 0
      ? detailRows
      : includeDetails
        ? '当前分页没有详细记录。请检查 offset，或使用 offset=0 从第一条开始查询。'
        : '本次未返回详细记录（include_details=false）。统计摘要仍基于完整匹配结果。';

    const message = `## 查询结果：${rangeLabel}
${params.category ? `筛选类别：${params.category}\n` : ''}${params.goal ? `筛选目标：${params.goal}\n` : ''}
### 统计摘要
- 记录数：${processed.length} 条${detailCountNote}
- 总时长：${formatDuration(totalMinutes)}
- 类别分布：${categoryStats || '无'}
- 目标分布（Top 10）：${goalStats || '无'}
${pagingHint}

### 详细记录
ID | 日期时间 | 活动 | 类别 | 目标 | 时长
${entriesText}`;

    return {
      success: true,
      message,
      data: {
        pagination: {
          total: sorted.length,
          returned,
          limit,
          offset,
          order: DETAIL_ORDER,
          details_included: includeDetails,
          has_more: hasMore,
          next_offset: nextOffset,
          has_previous: hasPrevious,
          previous_offset: previousOffset,
        },
        summary: {
          total_minutes: totalMinutes,
          category_minutes: categoryAgg,
          goal_minutes: goalAgg,
        },
      },
    };
  },
};
