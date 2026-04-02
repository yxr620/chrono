/**
 * Action: update_entry
 * 修改一条已有时间记录
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../../utils/autoPush';
import type { ActionDefinition } from '../types';
import type { TimeEntry } from '../../db';

export const updateEntryAction: ActionDefinition = {
  name: 'update_entry',
  description:
    '修改一条已有时间记录。可修改活动名、分类、目标、开始/结束时间。需要记录ID（支持前8位前缀匹配）。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      entry_id: {
        type: 'string',
        description: '记录ID（支持前8位前缀匹配）',
      },
      activity: {
        type: 'string',
        description: '可选，新的活动描述',
      },
      category: {
        type: 'string',
        description: '可选，新的类别名称',
      },
      goal: {
        type: 'string',
        description: '可选，新的目标名称',
      },
      start_time: {
        type: 'string',
        description: '可选，新的开始时间，格式 HH:mm',
      },
      end_time: {
        type: 'string',
        description: '可选，新的结束时间，格式 HH:mm',
      },
    },
    required: ['entry_id'],
  },

  handler: async (params) => {
    const entryId = params.entry_id as string;

    const entry = await db.entries
      .filter(e => e.id!.startsWith(entryId) && !e.deleted)
      .first();

    if (!entry) {
      return { success: false, message: `未找到ID以 "${entryId}" 开头的记录` };
    }

    const updates: Partial<TimeEntry> = {};
    const changeDescriptions: string[] = [];

    if (params.activity) {
      updates.activity = params.activity as string;
      changeDescriptions.push(`活动→"${updates.activity}"`);
    }

    if (params.category) {
      const catName = (params.category as string).toLowerCase();
      const categories = await db.categories.filter(c => !c.deleted).toArray();
      const matched = categories.filter(c =>
        c.name.toLowerCase().includes(catName),
      );
      if (matched.length > 0) {
        updates.categoryId = matched[0].id;
        changeDescriptions.push(`类别→"${matched[0].name}"`);
      }
    }

    if (params.goal) {
      const goalName = (params.goal as string).toLowerCase();
      const goals = await db.goals.filter(g => !g.deleted).toArray();
      const matched = goals.filter(g =>
        g.name.toLowerCase().includes(goalName),
      );
      if (matched.length > 0) {
        updates.goalId = matched[0].id!;
        changeDescriptions.push(`目标→"${matched[0].name}"`);
      }
    }

    const entryDate = dayjs(entry.startTime).format('YYYY-MM-DD');

    if (params.start_time) {
      updates.startTime = dayjs(`${entryDate} ${params.start_time as string}`).toDate();
      changeDescriptions.push(`开始→${params.start_time}`);
    }

    if (params.end_time) {
      updates.endTime = dayjs(`${entryDate} ${params.end_time as string}`).toDate();
      changeDescriptions.push(`结束→${params.end_time}`);
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, message: '未提供任何修改字段' };
    }

    await dataService.entries.update(entry.id!, updates);
    await useEntryStore.getState().loadEntries();
    autoPush('AI更新记录后');

    const shortId = entry.id!.slice(0, 8);
    return {
      success: true,
      message: `已更新记录 ${shortId}：${changeDescriptions.join('，')}`,
    };
  },

  confirm: async (params) => {
    const entryId = params.entry_id as string;

    const entry = await db.entries
      .filter(e => e.id!.startsWith(entryId) && !e.deleted)
      .first();

    if (!entry) {
      return {
        title: '更新记录',
        description: `未找到ID以 "${entryId}" 开头的记录`,
        changes: [],
        risk: 'low',
      };
    }

    const shortId = entry.id!.slice(0, 8);
    const details: string[] = [];
    if (params.activity) details.push(`活动: "${entry.activity}" → "${params.activity}"`);
    if (params.start_time) details.push(`开始: ${dayjs(entry.startTime).format('HH:mm')} → ${params.start_time}`);
    if (params.end_time) details.push(`结束: ${entry.endTime ? dayjs(entry.endTime).format('HH:mm') : '进行中'} → ${params.end_time}`);
    if (params.category) details.push(`类别 → "${params.category}"`);
    if (params.goal) details.push(`目标 → "${params.goal}"`);

    return {
      title: '更新时间记录',
      description: `修改记录 ${shortId}（${entry.activity}）`,
      changes: [
        {
          type: 'update',
          entity: 'TimeEntry',
          summary: details.join('；'),
        },
      ],
      risk: 'low',
    };
  },
};
