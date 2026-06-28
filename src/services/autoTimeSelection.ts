import dayjs from 'dayjs';
import type { TimeEntry } from './db';

type TimeRangeEntry = Pick<TimeEntry, 'id' | 'startTime' | 'endTime' | 'deleted'>;

export const ensureDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

export const fallbackStartTimeForDate = (dateStr: string, now: Date = new Date()): Date => {
  const clock = dayjs(now);
  return dayjs(dateStr)
    .hour(clock.hour())
    .minute(clock.minute())
    .second(clock.second())
    .millisecond(clock.millisecond())
    .toDate();
};

type ClippedInterval = {
  startMs: number;
  endMs: number;
};

const getClippedIntervalsForDate = (
  entries: TimeRangeEntry[],
  dateStr: string,
): ClippedInterval[] => {
  const dayStartMs = dayjs(dateStr).startOf('day').valueOf();
  const dayEndMs = dayjs(dateStr).endOf('day').valueOf();

  return entries
    .flatMap((entry): ClippedInterval[] => {
      if (entry.deleted || !entry.endTime) return [];
      const startMs = ensureDate(entry.startTime).getTime();
      const endMs = ensureDate(entry.endTime).getTime();
      if (startMs >= dayEndMs || endMs <= dayStartMs) return [];

      return [{
        startMs: Math.max(startMs, dayStartMs),
        endMs: Math.min(endMs, dayEndMs),
      }];
    })
    .filter(interval => interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs);
};

export const getLastVisibleEndTimeForDate = (
  entries: TimeRangeEntry[],
  dateStr: string,
): Date | null => {
  const intervals = getClippedIntervalsForDate(entries, dateStr);
  if (intervals.length === 0) return null;

  const bestEndMs = Math.max(...intervals.map(interval => interval.endMs));
  return new Date(bestEndMs);
};

const getFirstGapStartTimeForDate = (
  entries: TimeRangeEntry[],
  dateStr: string,
): Date | null => {
  const intervals = getClippedIntervalsForDate(entries, dateStr);
  if (intervals.length === 0) return null;

  const dayStartMs = dayjs(dateStr).startOf('day').valueOf();
  const dayEndMs = dayjs(dateStr).endOf('day').valueOf();
  let coveredUntilMs = dayStartMs;

  for (const interval of intervals) {
    if (interval.startMs > coveredUntilMs) {
      return new Date(coveredUntilMs);
    }
    coveredUntilMs = Math.max(coveredUntilMs, interval.endMs);
    if (coveredUntilMs >= dayEndMs) return null;
  }

  return coveredUntilMs < dayEndMs ? new Date(coveredUntilMs) : null;
};

export const getAutoStartTimeForDate = (
  entries: TimeRangeEntry[],
  dateStr: string,
  now: Date = new Date(),
): Date => {
  const lastVisibleEndTime = getLastVisibleEndTimeForDate(entries, dateStr);
  if (!lastVisibleEndTime) return fallbackStartTimeForDate(dateStr, now);

  const dayEndMs = dayjs(dateStr).endOf('day').valueOf();
  if (lastVisibleEndTime.getTime() === dayEndMs) {
    const firstGapStartTime = getFirstGapStartTimeForDate(entries, dateStr);
    if (firstGapStartTime) return firstGapStartTime;
  }

  return lastVisibleEndTime;
};

export const getNextStartTimeAfter = (
  entries: TimeRangeEntry[],
  time: Date,
  excludeId?: string,
): Date | null => {
  const thresholdMs = time.getTime();
  let best: Date | null = null;
  let bestMs = Infinity;

  for (const entry of entries) {
    if (entry.deleted) continue;
    if (excludeId && entry.id === excludeId) continue;

    const start = ensureDate(entry.startTime);
    const startMs = start.getTime();
    if (startMs > thresholdMs && startMs < bestMs) {
      bestMs = startMs;
      best = start;
    }
  }

  return best;
};
