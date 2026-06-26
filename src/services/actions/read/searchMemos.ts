/**
 * Action: search_memos
 * 检索用户写过的感想/备注 (memo)。
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import type { ActionDefinition } from '../types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MEMO_ORDER = 'start_time_desc';

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

export const searchMemosAction: ActionDefinition = {
  name: 'search_memos',
  description:
    '检索用户写过的感想/备注 (memo)。可按时间范围、关键字筛选。返回 memo 内容 + 所属 entry 的简要上下文（日期、activity）。' +
    '用于回答用户关于"我之前关于 XX 的想法"、"本周/本月有哪些感想"、"帮我总结最近的反思"这类问题。支持 limit/offset 按最近优先分页。',
  category: 'read',
  risk: 'none',
  parameters: {
    type: 'object',
    properties: {
      start_date: {
        type: 'string',
        description: '起始日期，YYYY-MM-DD（可选，缺省=不限）',
      },
      end_date: {
        type: 'string',
        description: '结束日期，YYYY-MM-DD（可选，缺省=不限）',
      },
      query: {
        type: 'string',
        description: '可选，关键字。在 memo 内容中做不区分大小写的子串匹配',
      },
      limit: {
        type: 'number',
        description: `可选，返回条数上限，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}`,
      },
      offset: {
        type: 'number',
        description:
          '可选，分页偏移量，从 0 开始，按 start_time_desc 最近优先计数。工具返回 has_more=true 时用 next_offset 继续查询。',
      },
    },
    required: [],
  },

  handler: async (params) => {
    const startDateStr = params.start_date as string | undefined;
    const endDateStr = params.end_date as string | undefined;
    const query = (params.query as string | undefined)?.trim();
    const limit = readBoundedInteger(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);

    const startDate = startDateStr ? dayjs(startDateStr).startOf('day').toDate() : null;
    const endDate = endDateStr ? dayjs(endDateStr).endOf('day').toDate() : null;

    if (startDateStr && (!startDate || isNaN(startDate.getTime()))) {
      return { success: true, message: '错误：start_date 格式无效，请使用 YYYY-MM-DD' };
    }
    if (endDateStr && (!endDate || isNaN(endDate.getTime()))) {
      return { success: true, message: '错误：end_date 格式无效，请使用 YYYY-MM-DD' };
    }

    const all = await db.entries
      .filter(e => !e.deleted && !!e.memo && (e.memo as string).trim().length > 0)
      .toArray();

    let filtered = all;
    if (startDate) {
      filtered = filtered.filter(e => new Date(e.startTime).getTime() >= startDate.getTime());
    }
    if (endDate) {
      filtered = filtered.filter(e => new Date(e.startTime).getTime() <= endDate.getTime());
    }
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(e => (e.memo as string).toLowerCase().includes(q));
    }

    const sorted = filtered.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    const offset = readBoundedInteger(params.offset, 0, 0, sorted.length);
    const display = sorted.slice(offset, offset + limit);
    const returned = display.length;
    const hasMore = offset + returned < sorted.length;
    const hasPrevious = offset > 0;
    const nextOffset = hasMore ? offset + returned : null;
    const previousOffset = hasPrevious ? Math.max(0, offset - limit) : null;
    const truncated = sorted.length > returned;

    if (sorted.length === 0) {
      const rangeLabel = startDateStr || endDateStr
        ? `${startDateStr ?? '不限'} 至 ${endDateStr ?? '不限'}`
        : '全部时间';
      const queryLabel = query ? `，关键字="${query}"` : '';
      return {
        success: true,
        message: `${rangeLabel}${queryLabel} 范围内没有找到 memo。`,
        data: { memos: [], total: 0 },
      };
    }

    const memosText = display.length > 0
      ? display
        .map(e => {
          const date = dayjs(e.startTime).format('YYYY-MM-DD HH:mm');
          return `- [${date}] ${e.activity}\n  ${e.memo}`;
        })
        .join('\n')
      : '当前分页没有 memo。请检查 offset，或使用 offset=0 从最近一条开始查询。';

    const rangeLabel = startDateStr || endDateStr
      ? `${startDateStr ?? '不限'} 至 ${endDateStr ?? '不限'}`
      : '全部时间';
    const queryLabel = query ? `，关键字="${query}"` : '';
    const pageRange = formatPageRange(offset, returned, sorted.length);
    const truncationNote = truncated ? `（明细分页：${pageRange}）` : '';

    const message = `## Memo 检索结果：${rangeLabel}${queryLabel}

共找到 ${sorted.length} 条${truncationNote}
明细分页：${pageRange}，order=${MEMO_ORDER}，limit=${limit}，offset=${offset}
分页状态：has_previous=${hasPrevious}${previousOffset !== null ? `, previous_offset=${previousOffset}` : ''}；has_more=${hasMore}${nextOffset !== null ? `, next_offset=${nextOffset}` : ''}

${memosText}`;

    return {
      success: true,
      message,
      data: {
        memos: display.map(e => ({
          entryId: e.id,
          date: dayjs(e.startTime).format('YYYY-MM-DD'),
          startTime: e.startTime,
          activity: e.activity,
          memo: e.memo,
        })),
        total: sorted.length,
        truncated,
        pagination: {
          total: sorted.length,
          returned,
          limit,
          offset,
          order: MEMO_ORDER,
          has_more: hasMore,
          next_offset: nextOffset,
          has_previous: hasPrevious,
          previous_offset: previousOffset,
        },
      },
    };
  },
};
