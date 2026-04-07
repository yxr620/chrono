/**
 * Action: merge_entries
 * 合并多条时间记录为一条
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition, ConfirmationChange } from '../types';

export const mergeEntriesAction: ActionDefinition = {
  name: 'merge_entries',
  description:
    '合并多条时间记录为一条。使用最早的开始时间和最晚的结束时间。需要至少2条记录的ID。',
  category: 'write',
  risk: 'high',
  parameters: {
    type: 'object',
    properties: {
      entry_ids: {
        type: 'array',
        items: { type: 'string' },
        description: '记录ID数组（支持前缀匹配），至少2条',
      },
      activity: {
        type: 'string',
        description: '可选，合并后的活动名称，默认使用第一条记录的',
      },
      category: {
        type: 'string',
        description: '可选，合并后的类别名称',
      },
      goal: {
        type: 'string',
        description: '可选，合并后的目标名称',
      },
    },
    required: ['entry_ids'],
  },

  handler: async (params) => {
    const entryIds = params.entry_ids as string[];

    if (entryIds.length < 2) {
      return { success: false, message: '至少需要2条记录才能合并' };
    }

    // Resolve all entries by prefix match
    const allEntries = await db.entries.filter(e => !e.deleted).toArray();
    const resolved = entryIds.map(prefix => {
      const match = allEntries.find(e => e.id!.startsWith(prefix));
      return match ?? null;
    });

    const missing = entryIds.filter((_, i) => !resolved[i]);
    if (missing.length > 0) {
      return {
        success: false,
        message: `未找到以下ID开头的记录：${missing.join('、')}`,
      };
    }

    const entries = resolved.filter(e => e !== null);
    if (entries.length < 2) {
      return { success: false, message: '匹配到的记录不足2条' };
    }

    // Sort by startTime
    entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const earliest = entries[0];
    const latest = entries.reduce((max, e) =>
      e.endTime && (!max.endTime || e.endTime > max.endTime) ? e : max,
    );

    // Resolve category
    let categoryId = earliest.categoryId;
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

    // Resolve goal
    let goalId = earliest.goalId;
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

    const activity = (params.activity as string) || earliest.activity;

    // Create merged entry
    await dataService.entries.add({
      startTime: earliest.startTime,
      endTime: latest.endTime,
      activity,
      categoryId,
      goalId,
    });

    // Soft-delete originals
    for (const entry of entries) {
      await dataService.entries.delete(entry.id!);
    }

    await useEntryStore.getState().loadEntries();
    autoPush('AI合并记录后');

    const startStr = dayjs(earliest.startTime).format('MM-DD HH:mm');
    const endStr = latest.endTime
      ? dayjs(latest.endTime).format('HH:mm')
      : '进行中';
    const ids = entries.map(e => e.id!.slice(0, 8)).join('、');

    return {
      success: true,
      message: `已合并 ${entries.length} 条记录（${ids}）→ ${startStr}~${endStr} ${activity}`,
    };
  },

  confirm: async (params) => {
    const entryIds = params.entry_ids as string[];

    const allEntries = await db.entries.filter(e => !e.deleted).toArray();
    const resolved = entryIds
      .map(prefix => allEntries.find(e => e.id!.startsWith(prefix)) ?? null)
      .filter(e => e !== null);

    resolved.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const changes: ConfirmationChange[] = resolved.map(entry => {
      const shortId = entry.id!.slice(0, 8);
      const start = dayjs(entry.startTime).format('MM-DD HH:mm');
      const end = entry.endTime
        ? dayjs(entry.endTime).format('HH:mm')
        : '进行中';
      return {
        type: 'delete' as const,
        entity: 'TimeEntry',
        summary: `${shortId} | ${start}~${end} | ${entry.activity}`,
      };
    });

    const earliest = resolved[0];
    const latest = resolved.reduce((max, e) =>
      e.endTime && (!max.endTime || e.endTime > max.endTime) ? e : max,
    );
    const activity = (params.activity as string) || earliest?.activity || '';
    const startStr = earliest
      ? dayjs(earliest.startTime).format('MM-DD HH:mm')
      : '';
    const endStr = latest?.endTime
      ? dayjs(latest.endTime).format('HH:mm')
      : '进行中';

    changes.push({
      type: 'create',
      entity: 'TimeEntry',
      summary: `${startStr}~${endStr} ${activity}`,
    });

    return {
      title: `合并 ${resolved.length} 条记录`,
      description: `将 ${resolved.length} 条记录合并为一条`,
      changes,
      risk: 'high',
    };
  },
};
