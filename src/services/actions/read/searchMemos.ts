/**
 * Action: search_memos
 * 检索用户写过的感想/备注 (memo)。
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import type { ActionDefinition } from '../types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const searchMemosAction: ActionDefinition = {
  name: 'search_memos',
  description:
    '检索用户写过的感想/备注 (memo)。可按时间范围、关键字筛选。返回 memo 内容 + 所属 entry 的简要上下文（日期、activity）。' +
    '用于回答用户关于"我之前关于 XX 的想法"、"本周/本月有哪些感想"、"帮我总结最近的反思"这类问题。',
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
    },
    required: [],
  },

  handler: async (params) => {
    const startDateStr = params.start_date as string | undefined;
    const endDateStr = params.end_date as string | undefined;
    const query = (params.query as string | undefined)?.trim();
    const rawLimit = typeof params.limit === 'number' ? params.limit : DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(MAX_LIMIT, rawLimit));

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
    const truncated = sorted.length > limit;
    const display = sorted.slice(0, limit);

    if (display.length === 0) {
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

    const memosText = display
      .map(e => {
        const date = dayjs(e.startTime).format('YYYY-MM-DD HH:mm');
        return `- [${date}] ${e.activity}\n  ${e.memo}`;
      })
      .join('\n');

    const rangeLabel = startDateStr || endDateStr
      ? `${startDateStr ?? '不限'} 至 ${endDateStr ?? '不限'}`
      : '全部时间';
    const queryLabel = query ? `，关键字="${query}"` : '';
    const truncationNote = truncated ? `（共 ${sorted.length} 条，仅展示最近 ${limit} 条）` : '';

    const message = `## Memo 检索结果：${rangeLabel}${queryLabel}

共找到 ${sorted.length} 条${truncationNote}

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
      },
    };
  },
};
