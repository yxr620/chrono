import type { ChartDataPoint, DateRange } from '../../types/analysis';
import type { TimeEntry } from '../db';
import { ANALYSIS_NEUTRAL_COLOR, withAlpha } from './displayColors';

export interface DashboardCategorySummaryItem extends ChartDataPoint {
  displayColor: string;
  tint?: string;
}

const CATEGORY_LEGEND_LIMIT = 6;

/** 将分析封面的总时长压缩为更适合大字号展示的格式。 */
export function formatDashboardDuration(minutes: number): string {
  const roundedMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;

  if (hours === 0) return `${remainingMinutes}M`;
  if (remainingMinutes === 0) return `${hours}H`;
  return `${hours}H ${remainingMinutes}M`;
}

/**
 * 类别较少时完整展示；类别较多时保留前五项，并将剩余类别合并为一项。
 * 这样环形图中的每个扇区始终都有对应图例，同时避免卡片无限增高。
 */
export function buildDashboardCategorySummary(
  data: DashboardCategorySummaryItem[],
): DashboardCategorySummaryItem[] {
  if (data.length <= CATEGORY_LEGEND_LIMIT) return data;

  const visibleItems = data.slice(0, CATEGORY_LEGEND_LIMIT - 1);
  const remainingItems = data.slice(CATEGORY_LEGEND_LIMIT - 1);

  return [
    ...visibleItems,
    {
      name: `其余 ${remainingItems.length} 类`,
      value: remainingItems.reduce((sum, item) => sum + item.value, 0),
      displayColor: ANALYSIS_NEUTRAL_COLOR,
      tint: withAlpha(ANALYSIS_NEUTRAL_COLOR, 0.16),
    },
  ];
}

/** 取当前分析范围内最近写下的感想。 */
export function selectRecentMemos(
  entries: TimeEntry[],
  dateRange: DateRange,
  limit = 5,
): TimeEntry[] {
  const rangeStart = dateRange.start.getTime();
  const rangeEnd = dateRange.end.getTime();

  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd < rangeStart || limit <= 0) {
    return [];
  }

  return entries
    .filter((entry) => {
      const startTime = new Date(entry.startTime).getTime();
      return !entry.deleted
        && typeof entry.memo === 'string'
        && entry.memo.trim().length > 0
        && Number.isFinite(startTime)
        && startTime >= rangeStart
        && startTime <= rangeEnd;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit);
}
