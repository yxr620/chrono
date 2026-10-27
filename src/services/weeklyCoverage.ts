import dayjs from 'dayjs';
import type { TimeEntry } from './db';

export interface WeeklyCoverage {
  percentage: number;
  coveredMilliseconds: number;
  totalMilliseconds: number;
  isCurrentWeek: boolean;
  weekStart: Date;
  coverageEnd: Date;
}

export interface DailyCoverage {
  percentage: number;
  coveredMilliseconds: number;
  totalMilliseconds: number;
  isToday: boolean;
  dayStart: Date;
  coverageEnd: Date;
}

const getMondayWeekStart = (value: Date): Date => {
  const date = dayjs(value).startOf('day');
  const daysSinceMonday = (date.day() + 6) % 7;
  return date.subtract(daysSinceMonday, 'day').toDate();
};

const calculateCoverageTotals = (
  entries: TimeEntry[],
  rangeStart: Date,
  rangeEnd: Date,
  ongoingEnd: Date,
) => {
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const totalMilliseconds = Math.max(0, rangeEndMs - rangeStartMs);

  const intervals = entries
    .filter(entry => !entry.deleted)
    .map(entry => {
      const entryStartMs = dayjs(entry.startTime).valueOf();
      const entryEndMs = dayjs(entry.endTime ?? ongoingEnd).valueOf();

      if (
        !Number.isFinite(entryStartMs)
        || !Number.isFinite(entryEndMs)
        || entryEndMs <= entryStartMs
      ) {
        return null;
      }

      const start = Math.max(entryStartMs, rangeStartMs);
      const end = Math.min(entryEndMs, rangeEndMs);
      return end > start ? { start, end } : null;
    })
    .filter((interval): interval is { start: number; end: number } => interval !== null)
    .sort((a, b) => a.start - b.start);

  let coveredMilliseconds = 0;
  let mergedStart = 0;
  let mergedEnd = 0;

  intervals.forEach((interval, index) => {
    if (index === 0) {
      mergedStart = interval.start;
      mergedEnd = interval.end;
      return;
    }

    if (interval.start <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, interval.end);
      return;
    }

    coveredMilliseconds += mergedEnd - mergedStart;
    mergedStart = interval.start;
    mergedEnd = interval.end;
  });

  if (intervals.length > 0) {
    coveredMilliseconds += mergedEnd - mergedStart;
  }

  const percentage = totalMilliseconds > 0
    ? Math.min(100, Math.max(0, Math.round((coveredMilliseconds / totalMilliseconds) * 100)))
    : 0;

  return {
    percentage,
    coveredMilliseconds,
    totalMilliseconds,
  };
};

export const calculateWeeklyCoverage = (
  entries: TimeEntry[],
  selectedDate: Date,
  now: Date = new Date(),
): WeeklyCoverage => {
  const weekStart = dayjs(getMondayWeekStart(selectedDate));
  const weekEnd = weekStart.add(7, 'day');
  const currentWeekStart = dayjs(getMondayWeekStart(now));
  const isCurrentWeek = weekStart.isSame(currentWeekStart);
  const coverageEnd = isCurrentWeek ? dayjs(now) : weekEnd;
  const totals = calculateCoverageTotals(
    entries,
    weekStart.toDate(),
    coverageEnd.toDate(),
    now,
  );

  return {
    ...totals,
    isCurrentWeek,
    weekStart: weekStart.toDate(),
    coverageEnd: coverageEnd.toDate(),
  };
};

export const calculateDailyCoverage = (
  entries: TimeEntry[],
  selectedDate: Date,
  now: Date = new Date(),
): DailyCoverage => {
  const dayStart = dayjs(selectedDate).startOf('day');
  const dayEnd = dayStart.add(1, 'day');
  const isToday = dayStart.isSame(dayjs(now).startOf('day'));
  const coverageEnd = isToday ? dayjs(now) : dayEnd;
  const totals = calculateCoverageTotals(
    entries,
    dayStart.toDate(),
    coverageEnd.toDate(),
    now,
  );

  return {
    ...totals,
    isToday,
    dayStart: dayStart.toDate(),
    coverageEnd: coverageEnd.toDate(),
  };
};

/** 指定月份每天（截至今天）的记录覆盖率，key 为 YYYY-MM-DD；未来日期不出现在结果里 */
export const calculateMonthlyDailyCoverage = (
  entries: TimeEntry[],
  month: Date,
  now: Date = new Date(),
): Map<string, number> => {
  const monthStart = dayjs(month).startOf('month');
  const monthEnd = monthStart.add(1, 'month');
  const monthStartMs = monthStart.valueOf();
  const rangeEndMs = Math.min(monthEnd.valueOf(), now.getTime());

  // 先筛出与本月有交集的记录，避免每天都扫一遍全部历史
  const monthEntries = entries.filter(entry => {
    const entryStartMs = dayjs(entry.startTime).valueOf();
    const entryEndMs = dayjs(entry.endTime ?? now).valueOf();
    return entryStartMs < rangeEndMs && entryEndMs > monthStartMs;
  });

  const result = new Map<string, number>();
  for (
    let day = monthStart;
    day.isBefore(monthEnd) && !day.isAfter(now, 'day');
    day = day.add(1, 'day')
  ) {
    result.set(
      day.format('YYYY-MM-DD'),
      calculateDailyCoverage(monthEntries, day.toDate(), now).percentage,
    );
  }

  return result;
};
