// 类别颜色配置
// 预设类别定义 + 自定义类别可选颜色调色板

export interface CategoryConfig {
  id: string;
  name: string;
  color: string;
  order: number;
}

// 预设类别（作为默认值，实际数据存储在数据库中）
export const PRESET_CATEGORIES: Record<string, CategoryConfig> = {
  study: {
    id: 'study',
    name: '学习',
    color: '#1890FF',
    order: 1
  },
  work: {
    id: 'work',
    name: '工作',
    color: '#40A9FF',
    order: 2
  },
  daily: {
    id: 'daily',
    name: '日常',
    color: '#FFA940',
    order: 3
  },
  exercise: {
    id: 'exercise',
    name: '运动',
    color: '#FF7A45',
    order: 4
  },
  rest: {
    id: 'rest',
    name: '休息',
    color: '#9254DE',
    order: 5
  },
  entertainment: {
    id: 'entertainment',
    name: '娱乐',
    color: '#B37FEB',
    order: 6
  }
};

// 自定义类别可选颜色调色板
export const COLOR_PALETTE = [
  '#1890FF', '#40A9FF', '#FFA940', '#FF7A45', '#9254DE', '#B37FEB',
  '#36CFC9', '#73D13D', '#FF4D4F', '#F759AB', '#597EF7', '#FFC53D',
  '#FF85C0', '#5CDBD3', '#95DE64', '#FF9C6E', '#85A5FF', '#D3ADF7',
];

// 预设类别 ID 集合
export const PRESET_CATEGORY_IDS = new Set(Object.keys(PRESET_CATEGORIES));

// 获取类别颜色（回退用，优先从 DB 读取）
export const getCategoryColor = (categoryId: string | null): string => {
  if (!categoryId) return '#d9d9d9';
  return PRESET_CATEGORIES[categoryId]?.color || '#d9d9d9';
};

// 获取类别名称（回退用，优先从 DB 读取）
export const getCategoryName = (categoryId: string | null): string | null => {
  if (!categoryId) return null;
  return PRESET_CATEGORIES[categoryId]?.name || null;
};
