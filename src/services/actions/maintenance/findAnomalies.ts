/**
 * Action: find_anomalies
 * 检测异常记录：时间倒序、超长记录、未关闭的旧计时器
 */

import dayjs from 'dayjs';
import { dataService } from '../../dataService';
import type { ActionDefinition } from '../types';

export const findAnomaliesAction: ActionDefinition = {
  name: 'find_anomalies',
  description: '检测异常记录：时间倒序、超长记录、未关闭的旧计时器。',
  category: 'maintenance',
  risk: 'none',
  parameters: {
    type: 'object',
    properties: {
      max_duration_hours: {
        type: 'number',
        description: '超过此时长（小时）视为异常，默认 12',
      },
      stale_active_hours: {
        type: 'number',
        description: '未结束超过此时长（小时）视为异常，默认 24',
      },
    },
    required: [],
  },

  handler: async (params) => {
    const maxDurationHours = params.max_duration_hours as number | undefined;
    const staleActiveHours = params.stale_active_hours as number | undefined;

    const anomalies = await dataService.entries.findAnomalies({ maxDurationHours, staleActiveHours });

    if (anomalies.length === 0) {
      return { success: true, message: '未发现异常记录。' };
    }

    const lines = anomalies.map((a, i) => {
      const start = dayjs(a.entry.startTime).format('MM-DD HH:mm');
      const end = a.entry.endTime ? dayjs(a.entry.endTime).format('HH:mm') : '进行中';
      return `${i + 1}. [${a.type}] ${start}~${end}「${a.entry.activity}」— ${a.message}`;
    });

    return {
      success: true,
      message: `发现 ${anomalies.length} 条异常：\n${lines.join('\n')}`,
    };
  },
};
