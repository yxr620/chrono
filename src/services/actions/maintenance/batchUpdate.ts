/**
 * Action: batch_update
 * 批量修改记录的分类或目标
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition } from '../types';

export const batchUpdateAction: ActionDefinition = {
  name: 'batch_update',
  description: '批量修改记录的分类或目标。可按日期范围、当前分类、活动关键词筛选。',
  category: 'maintenance',
  risk: 'high',
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
      filter_category: {
        type: 'string',
        description: '可选，仅修改该分类的记录',
      },
      filter_activity: {
        type: 'string',
        description: '可选，活动包含该关键词',
      },
      new_category: {
        type: 'string',
        description: '可选，设置新分类名称',
      },
      new_goal: {
        type: 'string',
        description: '可选，设置新目标名称',
      },
    },
    required: ['start_date', 'end_date'],
  },

  handler: async (params) => {
    const startDate = params.start_date as string;
    const endDate = params.end_date as string;
    const filterCategory = params.filter_category as string | undefined;
    const filterActivity = params.filter_activity as string | undefined;
    const newCategoryName = params.new_category as string | undefined;
    const newGoalName = params.new_goal as string | undefined;

    if (!newCategoryName && !newGoalName) {
      return { success: false, message: '至少需要提供 new_category 或 new_goal。' };
    }

    // Query entries in range
    let entries = await dataService.entries.query({ startDate, endDate });

    // Filter by category name
    if (filterCategory) {
      const categories = await db.categories.filter(c => !c.deleted).toArray();
      const catName = filterCategory.toLowerCase();
      const matchedCatIds = categories
        .filter(c => c.name.toLowerCase().includes(catName))
        .map(c => c.id);
      entries = entries.filter(e => e.categoryId && matchedCatIds.includes(e.categoryId));
    }

    // Filter by activity keyword
    if (filterActivity) {
      const keyword = filterActivity.toLowerCase();
      entries = entries.filter(e => e.activity.toLowerCase().includes(keyword));
    }

    if (entries.length === 0) {
      return { success: true, message: '没有匹配的记录。' };
    }

    // Resolve new category
    let newCategoryId: string | undefined;
    if (newCategoryName) {
      const categories = await db.categories.filter(c => !c.deleted).toArray();
      const matched = categories.find(c =>
        c.name.toLowerCase().includes(newCategoryName.toLowerCase()),
      );
      if (!matched) {
        return { success: false, message: `未找到分类 "${newCategoryName}"。` };
      }
      newCategoryId = matched.id;
    }

    // Resolve new goal
    let newGoalId: string | undefined;
    if (newGoalName) {
      const goals = await db.goals.filter(g => !g.deleted).toArray();
      const matched = goals.find(g =>
        g.name.toLowerCase().includes(newGoalName.toLowerCase()),
      );
      if (!matched) {
        return { success: false, message: `未找到目标 "${newGoalName}"。` };
      }
      newGoalId = matched.id!;
    }

    // Apply updates
    const updates: Record<string, unknown> = {};
    if (newCategoryId !== undefined) updates.categoryId = newCategoryId;
    if (newGoalId !== undefined) updates.goalId = newGoalId;

    for (const entry of entries) {
      await dataService.entries.update(entry.id!, updates);
    }

    await useEntryStore.getState().loadEntries();
    autoPush('AI批量更新后');

    return {
      success: true,
      message: `已更新 ${entries.length} 条记录。`,
    };
  },

  confirm: async (params) => {
    const startDate = params.start_date as string;
    const endDate = params.end_date as string;
    const filterCategory = params.filter_category as string | undefined;
    const filterActivity = params.filter_activity as string | undefined;
    const newCategoryName = params.new_category as string | undefined;
    const newGoalName = params.new_goal as string | undefined;

    let entries = await dataService.entries.query({ startDate, endDate });

    if (filterCategory) {
      const categories = await db.categories.filter(c => !c.deleted).toArray();
      const catName = filterCategory.toLowerCase();
      const matchedCatIds = categories
        .filter(c => c.name.toLowerCase().includes(catName))
        .map(c => c.id);
      entries = entries.filter(e => e.categoryId && matchedCatIds.includes(e.categoryId));
    }

    if (filterActivity) {
      const keyword = filterActivity.toLowerCase();
      entries = entries.filter(e => e.activity.toLowerCase().includes(keyword));
    }

    const changeParts: string[] = [];
    if (newCategoryName) changeParts.push(`分类→${newCategoryName}`);
    if (newGoalName) changeParts.push(`目标→${newGoalName}`);
    const changeDesc = changeParts.join(', ');

    const changes = entries.slice(0, 20).map(e => {
      const time = dayjs(e.startTime).format('MM-DD HH:mm');
      return {
        type: 'update' as const,
        entity: 'TimeEntry',
        summary: `${time}「${e.activity}」${changeDesc}`,
      };
    });

    if (entries.length > 20) {
      changes.push({
        type: 'update' as const,
        entity: 'TimeEntry',
        summary: `…及其他 ${entries.length - 20} 条`,
      });
    }

    return {
      title: '批量更新',
      description: `将更新 ${entries.length} 条记录：${changeDesc}`,
      changes,
      risk: 'high',
    };
  },
};
