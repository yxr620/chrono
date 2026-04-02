/**
 * Action: find_overlaps
 * 检测时间重叠的记录对
 */

import dayjs from 'dayjs';
import { dataService } from '../../dataService';
import type { ActionDefinition } from '../types';

export const findOverlapsAction: ActionDefinition = {
  name: 'find_overlaps',
  description: '检测指定日期范围内时间重叠的记录对。',
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
    },
    required: [],
  },

  handler: async (params) => {
    const startDate = params.start_date as string | undefined;
    const endDate = params.end_date as string | undefined;

    const overlaps = await dataService.entries.findOverlaps({ startDate, endDate });

    if (overlaps.length === 0) {
      return { success: true, message: '未发现时间重叠。' };
    }

    const lines = overlaps.map((o, i) => {
      const aStart = dayjs(o.entryA.startTime).format('MM-DD HH:mm');
      const aEnd = dayjs(o.entryA.endTime!).format('HH:mm');
      const bStart = dayjs(o.entryB.startTime).format('MM-DD HH:mm');
      const bEnd = dayjs(o.entryB.endTime!).format('HH:mm');
      return `${i + 1}. 「${o.entryA.activity}」${aStart}~${aEnd} ↔ 「${o.entryB.activity}」${bStart}~${bEnd}，重叠 ${o.overlapMinutes} 分钟`;
    });

    return {
      success: true,
      message: `发现 ${overlaps.length} 组重叠：\n${lines.join('\n')}`,
    };
  },
};
