/**
 * Action: list_goals
 * 获取指定日期范围内用户设定的目标列表
 */

import { dataService } from '../../dataService';
import type { ActionDefinition } from '../types';

export const listGoalsAction: ActionDefinition = {
  name: 'list_goals',
  description: '获取指定日期范围内用户设定的目标列表',
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
    },
    required: ['start_date', 'end_date'],
  },

  handler: async (params) => {
    const startDate = params.start_date as string;
    const endDate = params.end_date as string;

    if (!startDate || !endDate) {
      return { success: true, message: '错误：需要提供 start_date 和 end_date 参数' };
    }

    const filtered = await dataService.goals.query({
      startDate,
      endDate,
    });

    if (filtered.length === 0) {
      return {
        success: true,
        message: `${startDate} 至 ${endDate} 范围内没有设定目标。`,
      };
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

    return {
      success: true,
      message: `目标列表（${startDate} 至 ${endDate}）：\n${lines}`,
    };
  },
};
