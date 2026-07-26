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

const getMondayWeekStart = (value: Date): Date => {
  const date = dayjs(value).startOf('day');
  const daysSinceMonday = (date.day() + 6) % 7;
  return date.subtract(daysSinceMonday, 'day').toDate();
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

  const rangeStartMs = weekStart.valueOf();
  const rangeEndMs = coverageEnd.valueOf();
  const totalMilliseconds = Math.max(0, rangeEndMs - rangeStartMs);

  const intervals = entries
    .filter(entry => !entry.deleted)
    .map(entry => {
      const entryStartMs = dayjs(entry.startTime).valueOf();
      const entryEndMs = dayjs(entry.endTime ?? now).valueOf();

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
    isCurrentWeek,
    weekStart: weekStart.toDate(),
    coverageEnd: coverageEnd.toDate(),
  };
};
