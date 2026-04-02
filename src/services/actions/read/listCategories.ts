/**
 * Action: list_categories
 * 获取用户已有的所有活动类别列表
 */

import { dataService } from '../../dataService';
import type { ActionDefinition } from '../types';

export const listCategoriesAction: ActionDefinition = {
  name: 'list_categories',
  description: '获取用户已有的所有活动类别列表（如 学习、工作、运动 等）',
  category: 'read',
  risk: 'none',
  parameters: {
    type: 'object',
    properties: {},
  },

  handler: async () => {
    const categories = await dataService.categories.list();
    if (categories.length === 0) {
      return { success: true, message: '当前没有任何类别。' };
    }
    return {
      success: true,
      message: `可用类别：\n${categories.map(c => `- ${c.name}`).join('\n')}`,
    };
  },
};
