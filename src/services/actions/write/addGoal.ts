/**
 * Action: add_goal
 * 为指定日期创建一个目标
 */

import { dataService } from '../../dataService';
import { useGoalStore } from '../../../stores/goalStore';
import { autoPush } from '../../../utils/autoPush';
import type { ActionDefinition } from '../types';

export const addGoalAction: ActionDefinition = {
  name: 'add_goal',
  description: '为指定日期创建一个目标。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: '日期，格式 YYYY-MM-DD',
      },
      name: {
        type: 'string',
        description: '目标名称',
      },
      color: {
        type: 'string',
        description: '可选，目标颜色',
      },
    },
    required: ['date', 'name'],
  },

  handler: async (params) => {
    const date = params.date as string;
    const name = params.name as string;
    const color = params.color as string | undefined;

    await dataService.goals.add({ name, date, color });
    await useGoalStore.getState().loadGoals();
    autoPush('AI添加目标后');

    return {
      success: true,
      message: `已添加目标：${date} ${name}`,
    };
  },

  confirm: async (params) => {
    const date = params.date as string;
    const name = params.name as string;

    return {
      title: '添加目标',
      description: `将在 ${date} 创建一个新目标`,
      changes: [
        {
          type: 'create',
          entity: 'Goal',
          summary: `${date} ${name}${params.color ? ` [${params.color}]` : ''}`,
        },
      ],
      risk: 'low',
    };
  },
};
