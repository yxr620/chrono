/**
 * Action: delete_entry
 * 删除一条时间记录（软删除）
 */

import dayjs from 'dayjs';
import { db } from '../../db';
import { dataService } from '../../dataService';
import { useEntryStore } from '../../../stores/entryStore';
import { autoPush } from '../../autoPush';
import type { ActionDefinition } from '../types';

export const deleteEntryAction: ActionDefinition = {
  name: 'delete_entry',
  description:
    '删除一条时间记录（软删除）。需要记录ID（支持前8位前缀匹配）。',
  category: 'write',
  risk: 'high',
  parameters: {
    type: 'object',
    properties: {
      entry_id: {
        type: 'string',
        description: '记录ID（支持前8位前缀匹配）',
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

    await dataService.entries.delete(entry.id!);
    await useEntryStore.getState().loadEntries();
    autoPush('AI删除记录后');

    const shortId = entry.id!.slice(0, 8);
    const start = dayjs(entry.startTime).format('MM-DD HH:mm');
    const end = entry.endTime ? dayjs(entry.endTime).format('HH:mm') : '进行中';

    return {
      success: true,
      message: `已删除记录 ${shortId}：${start}~${end} ${entry.activity}`,
    };
  },

  confirm: async (params) => {
    const entryId = params.entry_id as string;

    const entry = await db.entries
      .filter(e => e.id!.startsWith(entryId) && !e.deleted)
      .first();

    if (!entry) {
      return {
        title: '删除记录',
        description: `未找到ID以 "${entryId}" 开头的记录`,
        changes: [],
        risk: 'high',
      };
    }

    const shortId = entry.id!.slice(0, 8);
    const start = dayjs(entry.startTime).format('MM-DD HH:mm');
    const end = entry.endTime ? dayjs(entry.endTime).format('HH:mm') : '进行中';

    return {
      title: '删除时间记录',
      description: `⚠️ 将软删除以下记录（不可在界面中恢复）`,
      changes: [
        {
          type: 'delete',
          entity: 'TimeEntry',
          summary: `${shortId} | ${start}~${end} | ${entry.activity}`,
        },
      ],
      risk: 'high',
    };
  },
};
