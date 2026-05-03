/**
 * Action: delete_goal
 * 删除一个目标（软删除）
 */

import { db } from '../../db';
import { dataService } from '../../dataService';
import { useGoalStore } from '../../../stores/goalStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition } from '../types';

export const deleteGoalAction: ActionDefinition = {
  name: 'delete_goal',
  description: '删除一个目标（软删除）。需要目标ID（支持前缀匹配）。',
  category: 'write',
  risk: 'high',
  parameters: {
    type: 'object',
    properties: {
      goal_id: {
        type: 'string',
        description: '目标ID（支持前缀匹配）',
      },
    },
    required: ['goal_id'],
  },

  handler: async (params) => {
    const goalId = params.goal_id as string;

    const goal = await db.goals
      .filter(g => g.id!.startsWith(goalId) && !g.deleted)
      .first();

    if (!goal) {
      return { success: false, message: `未找到ID以 "${goalId}" 开头的目标` };
    }

    await dataService.goals.delete(goal.id!);
    await useGoalStore.getState().loadGoals();
    autoPush('AI删除目标后');

    const shortId = goal.id!.slice(0, 8);
    return {
      success: true,
      message: `已删除目标 ${shortId}：${goal.name}`,
    };
  },

  confirm: async (params) => {
    const goalId = params.goal_id as string;

    const goal = await db.goals
      .filter(g => g.id!.startsWith(goalId) && !g.deleted)
      .first();

    if (!goal) {
      return {
        title: '删除目标',
        description: `未找到ID以 "${goalId}" 开头的目标`,
        changes: [],
        risk: 'high',
      };
    }

    const shortId = goal.id!.slice(0, 8);

    return {
      title: '删除目标',
      description: `⚠️ 将软删除以下目标（不可在界面中恢复）`,
      changes: [
        {
          type: 'delete',
          entity: 'Goal',
          summary: `${shortId} | ${goal.date} | ${goal.name}`,
        },
      ],
      risk: 'high',
    };
  },
};
