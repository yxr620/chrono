/**
 * Action: auto_categorize
 * 自动为缺失分类的记录推断并补全分类
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition } from '../types';

export const autoCategorizeAction: ActionDefinition = {
  name: 'auto_categorize',
  description: '自动为缺失分类的记录推断并补全分类。基于活动名称与历史分类模式匹配。',
  category: 'maintenance',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: '可选，仅处理该日期的记录，格式 YYYY-MM-DD',
      },
    },
    required: [],
  },

  handler: async (params) => {
    const dateFilter = params.date as string | undefined;

    // Find uncategorized entries
    let uncategorized = await db.entries
      .filter(e => !e.deleted && !e.categoryId)
      .toArray();

    if (dateFilter) {
      const dayStart = dayjs(dateFilter).startOf('day').toDate();
      const dayEnd = dayjs(dateFilter).endOf('day').toDate();
      uncategorized = uncategorized.filter(
        e => e.startTime >= dayStart && e.startTime <= dayEnd,
      );
    }

    if (uncategorized.length === 0) {
      return { success: true, message: '没有缺失分类的记录。' };
    }

    // Build historical activity → categoryId frequency map
    const allEntries = await db.entries
      .filter(e => !e.deleted && !!e.categoryId)
      .toArray();

    const activityCategoryFreq = new Map<string, Map<string, number>>();
    for (const entry of allEntries) {
      const activity = entry.activity.toLowerCase();
      if (!activityCategoryFreq.has(activity)) {
        activityCategoryFreq.set(activity, new Map());
      }
      const freq = activityCategoryFreq.get(activity)!;
      freq.set(entry.categoryId!, (freq.get(entry.categoryId!) || 0) + 1);
    }

    // Match each uncategorized entry
    const updates: { id: string; activity: string; categoryId: string }[] = [];
    const unmatched: string[] = [];

    for (const entry of uncategorized) {
      const freq = activityCategoryFreq.get(entry.activity.toLowerCase());
      if (freq && freq.size > 0) {
        // Pick the most frequent categoryId
        let bestId = '';
        let bestCount = 0;
        for (const [catId, count] of freq) {
          if (count > bestCount) {
            bestCount = count;
            bestId = catId;
          }
        }
        updates.push({ id: entry.id!, activity: entry.activity, categoryId: bestId });
      } else {
        unmatched.push(entry.activity);
      }
    }

    // Apply updates
    for (const u of updates) {
      await dataService.entries.update(u.id, { categoryId: u.categoryId });
    }

    if (updates.length > 0) {
      await useEntryStore.getState().loadEntries();
      autoPush('AI自动归类后');
    }

    return {
      success: true,
      message: `已归类 ${updates.length} 条记录，${unmatched.length} 条无法推断。`,
    };
  },

  confirm: async (params) => {
    const dateFilter = params.date as string | undefined;

    let uncategorized = await db.entries
      .filter(e => !e.deleted && !e.categoryId)
      .toArray();

    if (dateFilter) {
      const dayStart = dayjs(dateFilter).startOf('day').toDate();
      const dayEnd = dayjs(dateFilter).endOf('day').toDate();
      uncategorized = uncategorized.filter(
        e => e.startTime >= dayStart && e.startTime <= dayEnd,
      );
    }

    // Build frequency map
    const allEntries = await db.entries
      .filter(e => !e.deleted && !!e.categoryId)
      .toArray();

    const activityCategoryFreq = new Map<string, Map<string, number>>();
    for (const entry of allEntries) {
      const activity = entry.activity.toLowerCase();
      if (!activityCategoryFreq.has(activity)) {
        activityCategoryFreq.set(activity, new Map());
      }
      const freq = activityCategoryFreq.get(activity)!;
      freq.set(entry.categoryId!, (freq.get(entry.categoryId!) || 0) + 1);
    }

    // Resolve category names
    const categories = await db.categories.filter(c => !c.deleted).toArray();
    const catMap = new Map(categories.map(c => [c.id, c.name]));

    const changes = uncategorized.map(entry => {
      const freq = activityCategoryFreq.get(entry.activity.toLowerCase());
      let catName = '无法推断';
      if (freq && freq.size > 0) {
        let bestId = '';
        let bestCount = 0;
        for (const [catId, count] of freq) {
          if (count > bestCount) {
            bestCount = count;
            bestId = catId;
          }
        }
        catName = catMap.get(bestId) ?? bestId;
      }
      const time = dayjs(entry.startTime).format('MM-DD HH:mm');
      return {
        type: 'update' as const,
        entity: 'TimeEntry',
        summary: `${time}「${entry.activity}」→ ${catName}`,
      };
    });

    return {
      title: '自动归类',
      description: `将为 ${uncategorized.length} 条缺失分类的记录推断分类`,
      changes,
      risk: 'low',
    };
  },
};
