import { v4 as uuidv4 } from 'uuid';
import { db, type TimeEntry, type Goal, type Category } from './db';
import { syncDb } from './syncDb';
import { tryMergeWithLeftNeighbor } from './autoMerge';
import dayjs from 'dayjs';
import { resolveEntryCategoryId } from './entryCategoryAssignment';
import { invalidatePredictionCache } from './metadataPredictor';

// ============ Types ============

export interface TimeGap {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface SleepCandidate extends TimeGap {
  date: string;  // 归属日期（取 end 所在日期）
  isFullDayEmpty: boolean;
}

export interface OverlapPair {
  entryA: TimeEntry;
  entryB: TimeEntry;
  overlapMinutes: number;
}

export interface Anomaly {
  entry: TimeEntry;
  type: 'reversed_time' | 'too_long' | 'stale_active';
  message: string;
}

// ============ Entries ============

async function queryEntries(filters?: {
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
  categoryId?: string;
  goalId?: string;
}): Promise<TimeEntry[]> {
  let collection = db.entries.filter(e => !e.deleted);

  if (filters?.startDate) {
    const start = dayjs(filters.startDate).startOf('day').toDate();
    collection = collection.and(e => e.startTime >= start);
  }
  if (filters?.endDate) {
    const end = dayjs(filters.endDate).endOf('day').toDate();
    collection = collection.and(e => e.startTime <= end);
  }
  if (filters?.categoryId) {
    collection = collection.and(e => e.categoryId === filters.categoryId);
  }
  if (filters?.goalId) {
    collection = collection.and(e => e.goalId === filters.goalId);
  }

  return (await collection.toArray()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

async function addEntry(
  entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const categoryId = await resolveEntryCategoryId(entry.activity, entry.categoryId);
  const now = new Date();
  const newEntry: TimeEntry = {
    id: uuidv4(),
    ...entry,
    categoryId,
    createdAt: now,
    updatedAt: now,
  };
  const id = await syncDb.entries.add(newEntry);
  invalidatePredictionCache();
  if (newEntry.endTime != null) {
    await tryMergeWithLeftNeighbor(newEntry);
  }
  return id;
}

async function updateEntry(
  id: string,
  updates: Partial<TimeEntry>
): Promise<void> {
  const before = await db.entries.get(id);
  if (!before) {
    throw new Error(`Entry ${id} not found`);
  }

  const merged = { ...before, ...updates };
  const categoryId = await resolveEntryCategoryId(
    merged.activity,
    merged.categoryId ?? null,
  );

  await syncDb.entries.update(id, { ...updates, categoryId });
  invalidatePredictionCache();
  const endTimeJustSet = before.endTime == null && updates.endTime != null;
  if (endTimeJustSet) {
    const after = await db.entries.get(id);
    if (after) await tryMergeWithLeftNeighbor(after);
  }
}

async function deleteEntry(id: string): Promise<void> {
  await syncDb.entries.delete(id);
  invalidatePredictionCache();
}

async function batchAddEntries(
  entries: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const entry of entries) {
    const id = await addEntry(entry);
    ids.push(id);
  }
  return ids;
}

// ============ Goals ============

async function queryGoals(filters?: {
  startDate?: string;
  endDate?: string;
}): Promise<Goal[]> {
  let goals = await db.goals.filter(g => !g.deleted).toArray();
  if (filters?.startDate) {
    goals = goals.filter(g => g.date >= filters.startDate!);
  }
  if (filters?.endDate) {
    goals = goals.filter(g => g.date <= filters.endDate!);
  }
  return goals;
}

async function addGoal(
  goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = new Date();
  const type = goal.type ?? 'time';
  // check 型默认未完成；time 型不写 completed 字段，避免污染语义
  const checkDefaults = type === 'check' ? { completed: goal.completed ?? false } : {};
  return syncDb.goals.add({
    id: uuidv4(),
    ...goal,
    type,
    ...checkDefaults,
    createdAt: now,
    updatedAt: now,
  });
}

async function updateGoal(id: string, updates: Partial<Goal>): Promise<void> {
  await syncDb.goals.update(id, updates);
}

async function deleteGoal(id: string): Promise<void> {
  await syncDb.goals.delete(id);
}

/**
 * 切换 check 型目标的完成状态。
 * 仅对 type === 'check' 的目标有效；其他类型直接忽略，避免误用。
 */
async function toggleGoalCompletion(id: string): Promise<void> {
  const goal = await db.goals.get(id);
  if (!goal || goal.deleted) return;
  if ((goal.type ?? 'time') !== 'check') return;
  const nextCompleted = !goal.completed;
  await syncDb.goals.update(id, {
    completed: nextCompleted,
    completedAt: nextCompleted ? new Date() : undefined,
  });
}

// ============ Categories ============

async function listCategories(): Promise<Category[]> {
  return db.categories.filter(c => !c.deleted).sortBy('order');
}

async function addCategory(
  category: Omit<Category, 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = new Date();
  const newCategory: Category = {
    ...category,
    createdAt: now,
    updatedAt: now,
  };
  return syncDb.categories.add(newCategory);
}

async function updateCategory(
  id: string,
  updates: Partial<Category>
): Promise<void> {
  await syncDb.categories.update(id, updates);
}

async function deleteCategory(id: string): Promise<void> {
  await syncDb.categories.delete(id);
}

// ============ Maintenance: findGaps ============

async function findGaps(options: {
  startDate?: string;
  endDate?: string;
  minDurationMinutes?: number;
}): Promise<TimeGap[]> {
  const minDuration = options.minDurationMinutes ?? 60;

  const entries = await queryEntries({
    startDate: options.startDate,
    endDate: options.endDate,
  });

  // Filter out entries without endTime (active tracking)
  const completed = entries.filter(e => e.endTime !== null);
  if (completed.length === 0) return [];

  const gaps: TimeGap[] = [];

  // Group entries by date
  const byDate = new Map<string, TimeEntry[]>();
  for (const entry of completed) {
    const date = dayjs(entry.startTime).format('YYYY-MM-DD');
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(entry);
  }

  // Also consider the endTime date (entries spanning midnight)
  for (const entry of completed) {
    if (entry.endTime) {
      const endDate = dayjs(entry.endTime).format('YYYY-MM-DD');
      const startDate = dayjs(entry.startTime).format('YYYY-MM-DD');
      if (endDate !== startDate) {
        if (!byDate.has(endDate)) byDate.set(endDate, []);
        // Only add if not already present
        const arr = byDate.get(endDate)!;
        if (!arr.includes(entry)) arr.push(entry);
      }
    }
  }

  // Determine the date range to check
  const startDay = options.startDate
    ? dayjs(options.startDate)
    : dayjs(completed[0].startTime);
  const endDay = options.endDate
    ? dayjs(options.endDate)
    : dayjs();

  let currentDay = startDay.startOf('day');
  const lastDay = endDay.startOf('day');

  while (currentDay.isBefore(lastDay) || currentDay.isSame(lastDay, 'day')) {
    const dateStr = currentDay.format('YYYY-MM-DD');
    const dayStart = currentDay.startOf('day').toDate();
    const dayEnd = currentDay.endOf('day').toDate();

    const dayEntries = byDate.get(dateStr) || [];

    if (dayEntries.length === 0) {
      // Full day empty
      const durationMinutes = 1440; // 24 hours
      if (durationMinutes >= minDuration) {
        gaps.push({ start: dayStart, end: dayEnd, durationMinutes });
      }
    } else {
      // Sort entries by start time for this day
      const sorted = [...dayEntries].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      // Clip entries to this day's boundaries
      const clipped = sorted.map(e => ({
        start: new Date(Math.max(new Date(e.startTime).getTime(), dayStart.getTime())),
        end: new Date(Math.min(new Date(e.endTime!).getTime(), dayEnd.getTime())),
      }));

      // Gap before first entry
      const firstStart = clipped[0].start;
      const gapBefore = (firstStart.getTime() - dayStart.getTime()) / 60000;
      if (gapBefore >= minDuration) {
        gaps.push({ start: dayStart, end: firstStart, durationMinutes: Math.round(gapBefore) });
      }

      // Gaps between entries
      for (let i = 0; i < clipped.length - 1; i++) {
        const prevEnd = clipped[i].end;
        const nextStart = clipped[i + 1].start;
        const gapMinutes = (nextStart.getTime() - prevEnd.getTime()) / 60000;
        if (gapMinutes >= minDuration) {
          gaps.push({ start: prevEnd, end: nextStart, durationMinutes: Math.round(gapMinutes) });
        }
      }

      // Gap after last entry
      const lastEnd = clipped[clipped.length - 1].end;
      const gapAfter = (dayEnd.getTime() - lastEnd.getTime()) / 60000;
      if (gapAfter >= minDuration) {
        gaps.push({ start: lastEnd, end: dayEnd, durationMinutes: Math.round(gapAfter) });
      }
    }

    currentDay = currentDay.add(1, 'day');
  }

  return gaps;
}

// ============ Maintenance: findSleepGaps ============

async function findSleepGaps(options: {
  startDate?: string;
  endDate?: string;
  sleepWindowStart?: number;
  sleepWindowEnd?: number;
  minDurationMinutes?: number;
}): Promise<SleepCandidate[]> {
  const sleepStart = options.sleepWindowStart ?? 22;
  const sleepEnd = options.sleepWindowEnd ?? 10;
  const minDuration = options.minDurationMinutes ?? 60;

  const allGaps = await findGaps({
    startDate: options.startDate,
    endDate: options.endDate,
    minDurationMinutes: minDuration,
  });

  const candidates: SleepCandidate[] = [];

  for (const gap of allGaps) {
    const gapStartHour = gap.start.getHours();
    const gapEndHour = gap.end.getHours();
    const isFullDay = gap.durationMinutes >= 1430; // ~23h50m, essentially a full day

    // Check if gap overlaps with sleep window
    // Sleep window: sleepStart (e.g. 22:00) to sleepEnd (e.g. 10:00) next day
    const inSleepWindow =
      gapStartHour >= sleepStart ||  // starts after 22:00
      gapEndHour <= sleepEnd ||       // ends before 10:00
      gapStartHour < sleepEnd;        // starts before 10:00 (early morning gap)

    if (inSleepWindow) {
      candidates.push({
        ...gap,
        date: dayjs(gap.end).format('YYYY-MM-DD'),
        isFullDayEmpty: isFullDay,
      });
    }
  }

  return candidates;
}

// ============ Maintenance: findOverlaps ============

async function findOverlaps(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<OverlapPair[]> {
  const entries = await queryEntries({
    startDate: options?.startDate,
    endDate: options?.endDate,
  });

  const completed = entries.filter(e => e.endTime !== null);
  const overlaps: OverlapPair[] = [];

  for (let i = 0; i < completed.length - 1; i++) {
    const a = completed[i];
    const b = completed[i + 1];

    const aEnd = new Date(a.endTime!).getTime();
    const bStart = new Date(b.startTime).getTime();

    if (aEnd > bStart) {
      const overlapMs = aEnd - bStart;
      overlaps.push({
        entryA: a,
        entryB: b,
        overlapMinutes: Math.round(overlapMs / 60000),
      });
    }
  }

  return overlaps;
}

// ============ Maintenance: findAnomalies ============

async function findAnomalies(options?: {
  maxDurationHours?: number;
  staleActiveHours?: number;
}): Promise<Anomaly[]> {
  const maxDuration = (options?.maxDurationHours ?? 12) * 60; // in minutes
  const staleThreshold = (options?.staleActiveHours ?? 24) * 60 * 60 * 1000; // in ms

  const allEntries = await db.entries.filter(e => !e.deleted).toArray();
  const anomalies: Anomaly[] = [];
  const now = Date.now();

  for (const entry of allEntries) {
    const start = new Date(entry.startTime).getTime();

    if (entry.endTime !== null) {
      const end = new Date(entry.endTime).getTime();

      // Reversed time
      if (end < start) {
        anomalies.push({
          entry,
          type: 'reversed_time',
          message: '结束时间早于开始时间',
        });
        continue;
      }

      // Too long
      const durationMinutes = (end - start) / 60000;
      if (durationMinutes > maxDuration) {
        const hours = (durationMinutes / 60).toFixed(1);
        anomalies.push({
          entry,
          type: 'too_long',
          message: `超长记录 (${hours}h)`,
        });
      }
    } else {
      // Stale active
      if (now - start > staleThreshold) {
        const days = Math.round((now - start) / (24 * 60 * 60 * 1000));
        anomalies.push({
          entry,
          type: 'stale_active',
          message: `未结束的旧记录 (${days}天前)`,
        });
      }
    }
  }

  return anomalies;
}

// ============ Export ============

export const dataService = {
  entries: {
    query: queryEntries,
    add: addEntry,
    update: updateEntry,
    delete: deleteEntry,
    batchAdd: batchAddEntries,
    findGaps,
    findSleepGaps,
    findOverlaps,
    findAnomalies,
  },
  goals: { query: queryGoals, add: addGoal, update: updateGoal, delete: deleteGoal, toggleCompletion: toggleGoalCompletion },
  categories: { list: listCategories, add: addCategory, update: updateCategory, delete: deleteCategory },
};
