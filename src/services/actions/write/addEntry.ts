/**
 * Action: add_entry
 * 创建一条时间记录
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../../utils/autoPush';
import type { ActionDefinition } from '../types';

export const addEntryAction: ActionDefinition = {
  name: 'add_entry',
  description:
    '创建一条时间记录。需要开始时间和结束时间，活动描述，可选分类和目标。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: '日期，格式 YYYY-MM-DD',
      },
      start_time: {
        type: 'string',
        description: '开始时间，格式 HH:mm',
      },
      end_time: {
        type: 'string',
        description: '结束时间，格式 HH:mm',
      },
      activity: {
        type: 'string',
        description: '活动描述',
      },
      category: {
        type: 'string',
        description: '可选，类别名称',
      },
      goal: {
        type: 'string',
        description: '可选，目标名称',
      },
    },
    required: ['date', 'start_time', 'end_time', 'activity'],
  },

  handler: async (params) => {
    const date = params.date as string;
    const startTimeStr = params.start_time as string;
    const endTimeStr = params.end_time as string;
    const activity = params.activity as string;

    const startTime = dayjs(`${date} ${startTimeStr}`).toDate();
    const endTime = dayjs(`${date} ${endTimeStr}`).toDate();

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return { success: false, message: '无效的日期或时间格式' };
    }

    if (endTime <= startTime) {
      return { success: false, message: '结束时间必须晚于开始时间' };
    }

    let categoryId: string | null = null;
    if (params.category) {
      const catName = (params.category as string).toLowerCase();
      const categories = await db.categories.filter(c => !c.deleted).toArray();
      const matched = categories.filter(c =>
        c.name.toLowerCase().includes(catName),
      );
      if (matched.length > 0) {
        categoryId = matched[0].id;
      }
    }

    let goalId: string | null = null;
    if (params.goal) {
      const goalName = (params.goal as string).toLowerCase();
      const goals = await db.goals.filter(g => !g.deleted).toArray();
      const matched = goals.filter(g =>
        g.name.toLowerCase().includes(goalName),
      );
      if (matched.length > 0) {
        goalId = matched[0].id!;
      }
    }

    await dataService.entries.add({
      startTime,
      endTime,
      activity,
      categoryId,
      goalId,
    });

    await useEntryStore.getState().loadEntries();
    autoPush('AI添加记录后');

    return {
      success: true,
      message: `已添加记录：${startTimeStr}-${endTimeStr} ${activity}`,
    };
  },

  confirm: async (params) => {
    const startTimeStr = params.start_time as string;
    const endTimeStr = params.end_time as string;
    const activity = params.activity as string;
    const date = params.date as string;

    return {
      title: '添加时间记录',
      description: `将在 ${date} 创建一条新记录`,
      changes: [
        {
          type: 'create',
          entity: 'TimeEntry',
          summary: `${startTimeStr}-${endTimeStr} ${activity}${params.category ? ` [${params.category}]` : ''}${params.goal ? ` → ${params.goal}` : ''}`,
        },
      ],
      risk: 'low',
    };
  },
};
