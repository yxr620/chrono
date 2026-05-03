/**
 * Action: split_entry
 * 将一条时间记录按指定时间点拆分为两条
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition } from '../types';

export const splitEntryAction: ActionDefinition = {
  name: 'split_entry',
  description: '将一条时间记录按指定时间点拆分为两条。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      entry_id: {
        type: 'string',
        description: '记录ID（支持前缀匹配）',
      },
      split_time: {
        type: 'string',
        description: '拆分时间点，格式 HH:mm',
      },
      first_activity: {
        type: 'string',
        description: '可选，前半段活动名称，默认保持原活动',
      },
      second_activity: {
        type: 'string',
        description: '可选，后半段活动名称，默认保持原活动',
      },
    },
    required: ['entry_id', 'split_time'],
  },

  handler: async (params) => {
    const entryId = params.entry_id as string;
    const splitTimeStr = params.split_time as string;

    const entry = await db.entries
      .filter(e => e.id!.startsWith(entryId) && !e.deleted)
      .first();

    if (!entry) {
      return { success: false, message: `未找到ID以 "${entryId}" 开头的记录` };
    }

    if (!entry.endTime) {
      return { success: false, message: '无法拆分正在进行中的记录' };
    }

    const entryDate = dayjs(entry.startTime).format('YYYY-MM-DD');
    const splitTime = dayjs(`${entryDate} ${splitTimeStr}`).toDate();

    if (isNaN(splitTime.getTime())) {
      return { success: false, message: '无效的拆分时间格式' };
    }

    if (splitTime <= entry.startTime || splitTime >= entry.endTime) {
      const start = dayjs(entry.startTime).format('HH:mm');
      const end = dayjs(entry.endTime).format('HH:mm');
      return {
        success: false,
        message: `拆分时间必须在 ${start} 和 ${end} 之间`,
      };
    }

    const firstActivity = (params.first_activity as string) || entry.activity;
    const secondActivity = (params.second_activity as string) || entry.activity;
    const originalEndTime = entry.endTime;

    // Update original entry: shorten to first half
    await dataService.entries.update(entry.id!, {
      endTime: splitTime,
      activity: firstActivity,
    });

    // Create new entry for second half
    await dataService.entries.add({
      startTime: splitTime,
      endTime: originalEndTime,
      activity: secondActivity,
      categoryId: entry.categoryId,
      goalId: entry.goalId,
    });

    await useEntryStore.getState().loadEntries();
    autoPush('AI拆分记录后');

    const shortId = entry.id!.slice(0, 8);
    const startStr = dayjs(entry.startTime).format('HH:mm');
    const splitStr = dayjs(splitTime).format('HH:mm');
    const endStr = dayjs(originalEndTime).format('HH:mm');

    return {
      success: true,
      message: `已拆分记录 ${shortId}：${startStr}~${splitStr}「${firstActivity}」+ ${splitStr}~${endStr}「${secondActivity}」`,
    };
  },

  confirm: async (params) => {
    const entryId = params.entry_id as string;
    const splitTimeStr = params.split_time as string;

    const entry = await db.entries
      .filter(e => e.id!.startsWith(entryId) && !e.deleted)
      .first();

    if (!entry) {
      return {
        title: '拆分记录',
        description: `未找到ID以 "${entryId}" 开头的记录`,
        changes: [],
        risk: 'low',
      };
    }

    const shortId = entry.id!.slice(0, 8);
    const entryDate = dayjs(entry.startTime).format('YYYY-MM-DD');
    const splitTime = dayjs(`${entryDate} ${splitTimeStr}`);
    const startStr = dayjs(entry.startTime).format('HH:mm');
    const endStr = entry.endTime
      ? dayjs(entry.endTime).format('HH:mm')
      : '进行中';
    const splitStr = splitTime.format('HH:mm');

    const firstActivity = (params.first_activity as string) || entry.activity;
    const secondActivity = (params.second_activity as string) || entry.activity;

    return {
      title: '拆分记录',
      description: `将记录 ${shortId}（${entry.activity}）在 ${splitStr} 处拆分`,
      changes: [
        {
          type: 'update',
          entity: 'TimeEntry',
          summary: `${shortId} | ${startStr}~${splitStr} | ${firstActivity}`,
        },
        {
          type: 'create',
          entity: 'TimeEntry',
          summary: `${splitStr}~${endStr} | ${secondActivity}`,
        },
      ],
      risk: 'low',
    };
  },
};
