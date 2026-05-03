/**
 * Action: find_gaps
 * 检测时间空隙（未记录的时间段）
 */

import dayjs from 'dayjs';
import { dataService } from '../../dataService';
import type { ActionDefinition } from '../types';

export const findGapsAction: ActionDefinition = {
  name: 'find_gaps',
  description: '检测指定日期范围内的时间空隙（未记录的时间段）。',
  category: 'maintenance',
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
      min_duration_minutes: {
        type: 'number',
        description: '最小空隙时长（分钟），默认 30',
      },
    },
    required: [],
  },

  handler: async (params) => {
    const startDate = params.start_date as string | undefined;
    const endDate = params.end_date as string | undefined;
    const minDurationMinutes = (params.min_duration_minutes as number | undefined) ?? 30;

    const gaps = await dataService.entries.findGaps({ startDate, endDate, minDurationMinutes });

    if (gaps.length === 0) {
      return { success: true, message: '未发现时间空隙。' };
    }

    const lines = gaps.map((g, i) => {
      const date = dayjs(g.start).format('MM-DD');
      const start = dayjs(g.start).format('HH:mm');
      const end = dayjs(g.end).format('HH:mm');
      const hours = Math.floor(g.durationMinutes / 60);
      const mins = g.durationMinutes % 60;
      const duration = hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;
      return `${i + 1}. ${date} ${start}~${end}（${duration}）`;
    });

    return {
      success: true,
      message: `发现 ${gaps.length} 个空隙：\n${lines.join('\n')}`,
    };
  },
};
