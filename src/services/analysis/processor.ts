/**
 * 数据分析处理器
 * 负责数据加载、清洗、聚合等逻辑
 */
import dayjs from 'dayjs';
import { db } from '../db';
import type { TimeEntry, Goal, Category } from '../db';
import type {
  ProcessedEntry,
  AnalysisMetrics,
  ChartDataPoint,
  TrendDataPoint,
  CategoryTrendDataPoint,
  DateRange,
  AnalysisFilters,
} from '../../types/analysis';

/** 从类别列表构建 id → color 映射 */
function buildCategoryColorMap(categories?: Category[]): Map<string, string> {
  const map = new Map<string, string>();
  if (categories) {
    for (const c of categories) {
      if (c.color) map.set(c.id, c.color);
    }
  }
  return map;
}

/** 从类别列表构建 id → order 映射 */
function buildCategoryOrderMap(categories?: Category[]): Map<string, number> {
  const map = new Map<string, number>();
  if (categories) {
    for (const c of categories) {
      map.set(c.id, c.order);
    }
  }
  return map;
}

/** 默认时间范围：最近30天（不含今天） */
export function getDefaultDateRange(): DateRange {
  const today = new Date();
  const end = dayjs(today).subtract(1, 'day').endOf('day').toDate(); // 昨天
  const start = dayjs(today).subtract(30, 'day').startOf('day').toDate(); // 30天前
  return { start, end };
}

/** 加载原始数据 */
export async function loadRawData(filters: AnalysisFilters): Promise<{
  entries: TimeEntry[];
  goals: Goal[];
  categories: Category[];
}> {
  const { dateRange, goalIds, categoryIds } = filters;

  // 获取所有记录，然后在内存中过滤
  // 因为 startTime 在数据库中可能存储为字符串或 Date 对象
  let entries = await db.entries.toArray();

  // 转换日期范围为时间戳进行比较
  const startTs = dateRange.start.getTime();
  const endTs = dateRange.end.getTime();

  // 过滤时间范围和软删除
  entries = entries.filter(e => {
    if (e.deleted || !e.endTime) return false;
    const entryTs = new Date(e.startTime).getTime();
    return entryTs >= startTs && entryTs <= endTs;
  });

  // 按目标筛选
  if (goalIds && goalIds.length > 0) {
    entries = entries.filter(e => e.goalId && goalIds.includes(e.goalId));
  }

  // 按类别筛选
  if (categoryIds && categoryIds.length > 0) {
    entries = entries.filter(e => e.categoryId && categoryIds.includes(e.categoryId));
  }

  const goals = (await db.goals.toArray()).filter(g => !g.deleted);
  const categories = (await db.categories.toArray()).filter(c => !c.deleted);

  return { entries, goals, categories };
}

/** 处理原始数据，生成可分析的结构 */
export function processEntries(
  entries: TimeEntry[],
  goals: Goal[],
  categories: Category[]
): ProcessedEntry[] {
  const goalMap = new Map(goals.map(g => [g.id, g.name]));
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  return entries
    .filter(e => e.endTime) // 确保有结束时间
    .map(entry => {
      const startTime = new Date(entry.startTime);
      const endTime = new Date(entry.endTime!);
      const duration = dayjs(endTime).diff(startTime, 'minute');

      return {
        id: entry.id!,
        startTime,
        endTime,
        duration: Math.max(0, duration),
        activity: entry.activity,
        categoryId: entry.categoryId,
        categoryName: entry.categoryId ? (categoryMap.get(entry.categoryId) || '未分类') : '未分类',
        goalId: entry.goalId,
        goalName: entry.goalId ? (goalMap.get(entry.goalId) || '无目标') : '无目标',
        date: dayjs(startTime).format('YYYY-MM-DD'),
        hour: startTime.getHours(),
        weekday: startTime.getDay(),
      };
    })
    .filter(e => e.duration > 0); // 过滤无效记录
}

/** 计算分析指标 */
export function calculateMetrics(entries: ProcessedEntry[]): AnalysisMetrics {
  if (entries.length === 0) {
    return {
      totalTime: 0,
      totalEntries: 0,
      avgDuration: 0,
      activeDays: 0,
      topGoal: null,
      topCategory: null,
    };
  }

  const totalTime = entries.reduce((sum, e) => sum + e.duration, 0);
  const uniqueDates = new Set(entries.map(e => e.date));

  // 按目标分组计算
  const goalTimes = groupByGoal(entries);
  const topGoal = goalTimes.length > 0 ? goalTimes[0].name : null;

  // 按类别分组计算
  const categoryTimes = groupByCategory(entries);
  const topCategory = categoryTimes.length > 0 ? categoryTimes[0].name : null;

  return {
    totalTime,
    totalEntries: entries.length,
    avgDuration: Math.round(totalTime / entries.length),
    activeDays: uniqueDates.size,
    topGoal,
    topCategory,
  };
}

/** 按目标分组聚合 */
export function groupByGoal(entries: ProcessedEntry[]): ChartDataPoint[] {
  const groups = new Map<string, number>();

  entries.forEach(e => {
    const key = e.goalName || '无目标';
    groups.set(key, (groups.get(key) || 0) + e.duration);
  });

  return Array.from(groups.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** 按类别分组聚合 */
export function groupByCategory(entries: ProcessedEntry[], categories?: Category[]): ChartDataPoint[] {
  const categoryColorMap = buildCategoryColorMap(categories);
  const groups = new Map<string, { value: number; categoryId: string | null }>();

  entries.forEach(e => {
    const key = e.categoryName || '未分类';
    const existing = groups.get(key);
    if (existing) {
      existing.value += e.duration;
    } else {
      groups.set(key, { value: e.duration, categoryId: e.categoryId });
    }
  });

  return Array.from(groups.entries())
    .map(([name, data]) => ({
      name,
      value: data.value,
      color: data.categoryId ? (categoryColorMap.get(data.categoryId) || '#999') : '#999',
    }))
    .sort((a, b) => b.value - a.value);
}

/** 生成日期范围内的每一天 */
function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let current = dayjs(start).startOf('day');
  const endDay = dayjs(end).startOf('day');
  while (current.isBefore(endDay) || current.isSame(endDay, 'day')) {
    days.push(current.toDate());
    current = current.add(1, 'day');
  }
  return days;
}

/** 按日期分组（趋势图） */
export function groupByDay(entries: ProcessedEntry[], dateRange: DateRange): TrendDataPoint[] {
  const groups = new Map<string, number>();

  // 初始化日期范围内所有日期为0
  const days = eachDayOfInterval(dateRange.start, dateRange.end);
  days.forEach(day => {
    groups.set(dayjs(day).format('YYYY-MM-DD'), 0);
  });

  // 聚合数据
  entries.forEach(e => {
    groups.set(e.date, (groups.get(e.date) || 0) + e.duration);
  });

  return Array.from(groups.entries())
    .map(([date, value]) => ({
      date,
      value: Math.round(value / 60 * 10) / 10, // 转换为小时，保留1位小数
      label: dayjs(date).format('MM/DD'),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 按日期+类别分组（分类别趋势图）
 * 未分类时间包括：1) 已记录但未分类的事件 2) 当天未记录的空白时间
 */
export function groupByDayAndCategory(
  entries: ProcessedEntry[],
  dateRange: DateRange,
  categories?: Category[]
): { data: CategoryTrendDataPoint[]; categoryKeys: { id: string; name: string; color: string }[] } {
  const categoryColorMap = buildCategoryColorMap(categories);
  const categoryOrderMap = buildCategoryOrderMap(categories);
  // 获取所有出现的类别（不包括 uncategorized，后面单独处理）
  const categorySet = new Map<string, { name: string; color: string }>();
  entries.forEach(e => {
    if (e.categoryId) {
      const id = e.categoryId;
      if (!categorySet.has(id)) {
        categorySet.set(id, {
          name: e.categoryName || '未分类',
          color: categoryColorMap.get(id) || '#999',
        });
      }
    }
  });

  // 确保有"未分类"类别
  categorySet.set('uncategorized', {
    name: '未分类',
    color: '#e0e0e0',
  });

  // 初始化日期范围内所有日期
  const days = eachDayOfInterval(dateRange.start, dateRange.end);
  const today = dayjs().format('YYYY-MM-DD');
  
  const data: CategoryTrendDataPoint[] = days.map(day => {
    const dateStr = dayjs(day).format('YYYY-MM-DD');
    const point: CategoryTrendDataPoint = {
      date: dateStr,
      label: dayjs(day).format('MM/DD'),
    };
    // 初始化所有类别为0
    categorySet.forEach((_, id) => {
      point[id] = 0;
    });
    return point;
  });

  // 聚合已记录的数据，并计算每天已记录的总时长
  const dateIndexMap = new Map(data.map((d, i) => [d.date, i]));
  const dailyRecordedTime = new Map<string, number>(); // 每天已记录的总分钟数
  
  entries.forEach(e => {
    const idx = dateIndexMap.get(e.date);
    if (idx !== undefined) {
      const categoryId = e.categoryId || 'uncategorized';
      const current = data[idx][categoryId];
      data[idx][categoryId] = (typeof current === 'number' ? current : 0) + e.duration / 60;
      
      // 累计该天已记录的时间
      dailyRecordedTime.set(e.date, (dailyRecordedTime.get(e.date) || 0) + e.duration);
    }
  });

  // 计算每天未记录的时间，加入"未分类"
  const MINUTES_PER_DAY = 24 * 60;
  data.forEach(d => {
    const dateStr = d.date as string;
    // 跳过未来的日期
    if (dateStr > today) return;
    
    const recordedMinutes = dailyRecordedTime.get(dateStr) || 0;
    const unrecordedMinutes = Math.max(0, MINUTES_PER_DAY - recordedMinutes);
    const unrecordedHours = unrecordedMinutes / 60;
    
    // 将未记录时间加入"未分类"
    const current = d['uncategorized'];
    d['uncategorized'] = (typeof current === 'number' ? current : 0) + unrecordedHours;
  });

  // 四舍五入保留1位小数
  data.forEach(d => {
    categorySet.forEach((_, id) => {
      const val = d[id];
      if (typeof val === 'number') {
        d[id] = Math.round(val * 10) / 10;
      }
    });
  });

  // 构建类别列表，未分类放最后
  const categoryKeys = Array.from(categorySet.entries())
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => {
      if (a.id === 'uncategorized') return 1;
      if (b.id === 'uncategorized') return -1;
      const orderA = categoryOrderMap.get(a.id) ?? 999;
      const orderB = categoryOrderMap.get(b.id) ?? 999;
      return orderA - orderB;
    });

  return { data, categoryKeys };
}

/** 按小时分组（分布图） */
export function groupByHour(entries: ProcessedEntry[]): ChartDataPoint[] {
  const groups = new Map<number, number>();

  // 初始化24小时
  for (let i = 0; i < 24; i++) {
    groups.set(i, 0);
  }

  entries.forEach(e => {
    groups.set(e.hour, (groups.get(e.hour) || 0) + e.duration);
  });

  return Array.from(groups.entries())
    .map(([hour, value]) => ({
      name: `${hour}:00`,
      value: Math.round(value / 60 * 10) / 10, // 转换为小时
    }))
    .sort((a, b) => parseInt(a.name) - parseInt(b.name));
}

/** 按星期分布（热力图） */
export function groupByWeekday(entries: ProcessedEntry[]): ChartDataPoint[] {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const groups = new Map<number, number>();

  // 初始化
  for (let i = 0; i < 7; i++) {
    groups.set(i, 0);
  }

  entries.forEach(e => {
    groups.set(e.weekday, (groups.get(e.weekday) || 0) + e.duration);
  });

  return Array.from(groups.entries())
    .map(([weekday, value]) => ({
      name: weekdays[weekday],
      value: Math.round(value / 60 * 10) / 10,
    }));
}

/** 格式化时长显示 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

/** 格式化时长为小时 */
export function formatHours(minutes: number): string {
  const hours = Math.round(minutes / 60 * 10) / 10;
  return `${hours}h`;
}

/** 按周和类别分组（用于周度对比） */
export function groupByWeekAndCategory(
  entries: ProcessedEntry[],
  weeks: { start: Date; end: Date; label: string }[],
  categories?: Category[]
): { data: CategoryTrendDataPoint[]; categoryKeys: { id: string; name: string; color: string }[] } {
  const categoryColorMap = buildCategoryColorMap(categories);
  const categoryOrderMap = buildCategoryOrderMap(categories);
  const categorySet = new Map<string, { name: string; color: string }>();
  
  // 确保有"未分类"类别
  categorySet.set('uncategorized', {
    name: '未分类',
    color: '#e0e0e0',
  });
  
  // 初始化数据结构
  const data = weeks.map(week => {
    const point = {
      date: week.label,
      label: week.label,
    } as CategoryTrendDataPoint;
    // 初始化未分类为0
    point['uncategorized'] = 0;
    return point;
  });

  // 记录每周已记录的总时长
  const weeklyRecordedTime = new Map<number, number>();
  weeks.forEach((_, idx) => weeklyRecordedTime.set(idx, 0));

  // 遍历记录
  entries.forEach(e => {
    // 找到所属的周
    const weekIndex = weeks.findIndex(w => 
      e.startTime.getTime() >= w.start.getTime() && e.startTime.getTime() <= w.end.getTime()
    );

    if (weekIndex !== -1) {
      const categoryId = e.categoryId || 'uncategorized';
      const categoryName = e.categoryName || '未分类';
      
      // 记录类别信息
      if (!categorySet.has(categoryId)) {
        const color = categoryColorMap.get(categoryId) || '#999999';
        categorySet.set(categoryId, { name: categoryName, color });
      }

      // 累加时长 (小时)
      const currentVal = (data[weekIndex][categoryId] as number) || 0;
      data[weekIndex][categoryId] = currentVal + (e.duration / 60);
      
      // 累计该周已记录的时间（分钟）
      weeklyRecordedTime.set(weekIndex, (weeklyRecordedTime.get(weekIndex) || 0) + e.duration);
    }
  });

  // 计算每周未记录的时间，加入"未分类"
  const MINUTES_PER_WEEK = 7 * 24 * 60; // 一周的总分钟数
  const today = new Date();
  
  weeks.forEach((week, idx) => {
    // 跳过未来的周
    if (week.start > today) return;
    
    // 计算这一周实际应该有多少天（处理当前周可能不完整的情况）
    const weekEnd = week.end > today ? today : week.end;
    const daysInWeek = Math.ceil((weekEnd.getTime() - week.start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const maxMinutes = Math.min(MINUTES_PER_WEEK, daysInWeek * 24 * 60);
    
    const recordedMinutes = weeklyRecordedTime.get(idx) || 0;
    const unrecordedMinutes = Math.max(0, maxMinutes - recordedMinutes);
    const unrecordedHours = unrecordedMinutes / 60;
    
    // 将未记录时间加入"未分类"
    const current = data[idx]['uncategorized'];
    data[idx]['uncategorized'] = (typeof current === 'number' ? current : 0) + unrecordedHours;
  });

  // 四舍五入
  data.forEach(d => {
    categorySet.forEach((_, id) => {
      const val = d[id];
      if (typeof val === 'number') {
        d[id] = Math.round(val * 10) / 10;
      }
    });
  });

  // 构建类别列表
  const categoryKeys = Array.from(categorySet.entries())
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => {
      if (a.id === 'uncategorized') return 1;
      if (b.id === 'uncategorized') return -1;
      const orderA = categoryOrderMap.get(a.id) ?? 999;
      const orderB = categoryOrderMap.get(b.id) ?? 999;
      return orderA - orderB;
    });

  return { data, categoryKeys };
}
