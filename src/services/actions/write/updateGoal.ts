/**
 * Action: update_goal
 * 修改目标的名称或颜色
 */

import { db } from '../../db';
import { dataService } from '../../dataService';
import { useGoalStore } from '../../../stores/goalStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition } from '../types';

export const updateGoalAction: ActionDefinition = {
  name: 'update_goal',
  description: '修改目标的名称或颜色。需要目标ID（支持前缀匹配）。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      goal_id: {
        type: 'string',
        description: '目标ID（支持前缀匹配）',
      },
      name: {
        type: 'string',
        description: '可选，新的目标名称',
      },
      color: {
        type: 'string',
        description: '可选，新的目标颜色',
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

    const updates: Record<string, unknown> = {};
    if (params.name) updates.name = params.name as string;
    if (params.color) updates.color = params.color as string;

    if (Object.keys(updates).length === 0) {
      return { success: false, message: '未提供任何需要修改的字段' };
    }

    await dataService.goals.update(goal.id!, updates);
    await useGoalStore.getState().loadGoals();
    autoPush('AI修改目标后');

    const shortId = goal.id!.slice(0, 8);
    return {
      success: true,
      message: `已修改目标 ${shortId}：${Object.entries(updates).map(([k, v]) => `${k}→${v}`).join(', ')}`,
    };
  },

  confirm: async (params) => {
    const goalId = params.goal_id as string;

    const goal = await db.goals
      .filter(g => g.id!.startsWith(goalId) && !g.deleted)
      .first();

    if (!goal) {
      return {
        title: '修改目标',
        description: `未找到ID以 "${goalId}" 开头的目标`,
        changes: [],
        risk: 'low',
      };
    }

    const shortId = goal.id!.slice(0, 8);
    const parts: string[] = [];
    if (params.name) parts.push(`名称→${params.name}`);
    if (params.color) parts.push(`颜色→${params.color}`);

    return {
      title: '修改目标',
      description: `将修改目标 ${shortId} (${goal.name})`,
      changes: [
        {
          type: 'update',
          entity: 'Goal',
          summary: `${shortId} | ${goal.name} | ${parts.join(', ')}`,
        },
      ],
      risk: 'low',
    };
  },
};
