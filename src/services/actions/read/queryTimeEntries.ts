/**
 * Action: query_time_entries
 * 查询用户的时间记录数据，支持按时间范围、类别、目标筛选
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { loadRawData, processEntries, formatDuration } from '../../analysis/processor';
import type { ActionDefinition } from '../types';

const MAX_ENTRIES = 200;

export const queryTimeEntriesAction: ActionDefinition = {
  name: 'query_time_entries',
  description:
    '查询用户的时间记录数据。可按时间范围、类别、目标进行筛选，返回统计摘要和详细记录。每次查询最多返回 200 条记录。',
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
      category: {
        type: 'string',
        description: '可选，按类别名称筛选（如 "学习", "工作", "运动"）',
      },
      goal: {
        type: 'string',
        description: '可选，按目标名称筛选',
      },
    },
    required: ['start_date', 'end_date'],
  },

  handler: async (params) => {
    const startDate = new Date(params.start_date as string);
    const endDate = new Date(params.end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { success: true, message: '错误：无效的日期格式，请使用 YYYY-MM-DD' };
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // 加载所有类别和目标用于名称匹配
    const allCategories = await db.categories.toArray();
    const allGoals = await db.goals.toArray();

    // 名称 → ID 映射（模糊匹配）
    let categoryIds: string[] | undefined;
    if (params.category) {
      const catName = (params.category as string).toLowerCase();
      const matched = allCategories.filter(c =>
        c.name.toLowerCase().includes(catName),
      );
      if (matched.length > 0) {
        categoryIds = matched.map(c => c.id);
      } else {
        return {
          success: true,
          message: `未找到类别 "${params.category}"。可用类别：${allCategories.map(c => c.name).join(', ')}`,
        };
      }
    }

    let goalIds: string[] | undefined;
    if (params.goal) {
      const goalName = (params.goal as string).toLowerCase();
      const matched = allGoals.filter(g =>
        g.name.toLowerCase().includes(goalName),
      );
      if (matched.length > 0) {
        goalIds = matched.map(g => g.id!);
      } else {
        return { success: true, message: `未找到目标 "${params.goal}"。` };
      }
    }

    // 查询数据
    const { entries: rawEntries, goals, categories } = await loadRawData({
      dateRange: { start: startDate, end: endDate },
      goalIds,
      categoryIds,
    });

    const processed = processEntries(rawEntries, goals, categories);

    if (processed.length === 0) {
      const rangeLabel = `${dayjs(startDate).format('YYYY-MM-DD')} 至 ${dayjs(endDate).format('YYYY-MM-DD')}`;
      const filterDesc = [
        params.category ? `类别="${params.category}"` : '',
        params.goal ? `目标="${params.goal}"` : '',
      ].filter(Boolean).join(', ');
      return {
        success: true,
        message: `${rangeLabel} 范围内${filterDesc ? `（${filterDesc}）` : ''}没有找到记录。`,
      };
    }

    // 排序
    const sorted = [...processed].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    // 截断
    const truncated = sorted.length > MAX_ENTRIES;
    const display = truncated ? sorted.slice(-MAX_ENTRIES) : sorted;

    // 统计
    const totalMinutes = processed.reduce((s, e) => s + e.duration, 0);

    const categoryAgg: Record<string, number> = {};
    const goalAgg: Record<string, number> = {};
    processed.forEach(e => {
      categoryAgg[e.categoryName] = (categoryAgg[e.categoryName] || 0) + e.duration;
      goalAgg[e.goalName] = (goalAgg[e.goalName] || 0) + e.duration;
    });

    const categoryStats = Object.entries(categoryAgg)
      .sort((a, b) => b[1] - a[1])
      .map(([name, min]) => `${name}: ${formatDuration(min)}`)
      .join(', ');

    const goalStats = Object.entries(goalAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, min]) => `${name}: ${formatDuration(min)}`)
      .join(', ');

    // 详细记录（带短 ID）
    const entriesText = display
      .map(e => {
        const shortId = e.id.slice(0, 8);
        const start = dayjs(e.startTime).format('MM-DD HH:mm');
        const end = dayjs(e.endTime).format('HH:mm');
        return `${shortId} | ${start}~${end} | ${e.activity} | ${e.categoryName} | ${e.goalName} | ${formatDuration(e.duration)}`;
      })
      .join('\n');

    const rangeLabel = `${dayjs(startDate).format('YYYY-MM-DD')} 至 ${dayjs(endDate).format('YYYY-MM-DD')}`;

    const message = `## 查询结果：${rangeLabel}
${params.category ? `筛选类别：${params.category}\n` : ''}${params.goal ? `筛选目标：${params.goal}\n` : ''}
### 统计摘要
- 记录数：${processed.length} 条${truncated ? `（仅展示最近 ${MAX_ENTRIES} 条详情）` : ''}
- 总时长：${formatDuration(totalMinutes)}
- 类别分布：${categoryStats || '无'}
- 目标分布（Top 10）：${goalStats || '无'}

### 详细记录
ID | 日期时间 | 活动 | 类别 | 目标 | 时长
${entriesText}`;

    return { success: true, message };
  },
};
