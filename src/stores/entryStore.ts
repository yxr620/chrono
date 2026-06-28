import { create } from 'zustand';
import dayjs from 'dayjs';
import { db, type TimeEntry } from '../services/db';
import { dataService } from '../services/dataService';
import { autoPush } from '../services/autoPush';
import {
  getAutoStartTimeForDate as selectAutoStartTimeForDate,
  getLastVisibleEndTimeForDate as selectLastVisibleEndTimeForDate,
  getNextStartTimeAfter as selectNextStartTimeAfter,
} from '../services/autoTimeSelection';

interface EntryStore {
  entries: TimeEntry[];
  currentEntry: TimeEntry | null;
  nextStartTime: Date | null;
  nextEndTime: Date | null;

  // 操作方法
  loadEntries: (date?: string) => Promise<void>;
  startTracking: (activity: string, goalId?: string, startTime?: Date, categoryId?: string) => Promise<void>;
  stopTracking: () => Promise<void>;
  addEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateEntry: (id: string, updates: Partial<TimeEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  setNextStartTime: (time: Date | null) => void;
  setTimeRange: (startTime: Date | null, endTime: Date | null) => void;
  getLastEntryEndTime: () => Date | null;
  getLastVisibleEndTimeForDate: (date: string) => Date | null;
  getAutoStartTimeForDate: (date: string) => Date;
  getLastEndTimeBeforeOrAt: (time: Date, excludeId?: string) => Date | null;
  getNextStartTimeAfter: (time: Date, excludeId?: string) => Date | null;
  getEarliestEntryDate: () => string | null;
}

export const useEntryStore = create<EntryStore>((set, get) => ({
  entries: [],
  currentEntry: null,
  nextStartTime: null,
  nextEndTime: null,

  loadEntries: async (_date?: string) => {
    const allEntries = await db.entries.toArray();

    // 过滤掉软删除的记录
    const validEntries = allEntries.filter(e => !e.deleted);

    // 手动按 startTime 降序排序（最新的在前）
    const entries = validEntries.sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      return timeB - timeA; // 降序
    });

    // 找出进行中的记录
    const current = entries.find(e => e.endTime === null);

    set({ entries, currentEntry: current || null });
  },

  startTracking: async (activity: string, goalId?: string, startTime?: Date, categoryId?: string) => {
    const id = await dataService.entries.add({
      startTime: startTime || new Date(),
      endTime: null,
      activity,
      categoryId: categoryId || null,
      goalId: goalId || null,
    });
    const entry = await db.entries.get(id);
    set({ currentEntry: entry || null });
    await get().loadEntries();
    autoPush('开始计时后');
  },

  stopTracking: async () => {
    const { currentEntry } = get();
    if (!currentEntry?.id) return;

    await dataService.entries.update(currentEntry.id, {
      endTime: new Date(),
    });

    set({ currentEntry: null });
    await get().loadEntries();
    autoPush('记录完成后');
  },

  addEntry: async (entry) => {
    await dataService.entries.add(entry);
    await get().loadEntries();
    autoPush('添加记录后');
  },

  updateEntry: async (id, updates) => {
    await dataService.entries.update(id, updates);
    await get().loadEntries();
    autoPush('更新记录后');
  },

  deleteEntry: async (id) => {
    await dataService.entries.delete(id);
    await get().loadEntries();
    autoPush('删除记录后');
  },

  setNextStartTime: (time) => {
    set({ nextStartTime: time });
  },

  setTimeRange: (startTime, endTime) => {
    set({ nextStartTime: startTime, nextEndTime: endTime });
  },

  getLastEntryEndTime: () => {
    const { entries } = get();
    // 找到最近的已完成记录（有结束时间的）
    const completedEntries = entries.filter(e => e.endTime !== null);
    if (completedEntries.length === 0) return null;

    // 按结束时间排序，取最新的
    const sortedByEndTime = completedEntries.sort((a, b) =>
      new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime()
    );

    return sortedByEndTime[0].endTime;
  },

  getLastVisibleEndTimeForDate: (date: string) => {
    const { entries } = get();
    return selectLastVisibleEndTimeForDate(entries, date);
  },

  getAutoStartTimeForDate: (date: string) => {
    const { entries } = get();
    return selectAutoStartTimeForDate(entries, date);
  },

  getNextStartTimeAfter: (time: Date, excludeId?: string) => {
    const { entries } = get();
    return selectNextStartTimeAfter(entries, time, excludeId);
  },

  // 找出 endTime <= time 的所有已完成记录中，endTime 最大的那条。
  // 按时间轴前驱衔接，不受 selectedDate 限制，跨日记录也能找到。
  getLastEndTimeBeforeOrAt: (time: Date, excludeId?: string) => {
    const { entries } = get();
    const ts = time.getTime();
    let best: Date | null = null;
    let bestMs = -Infinity;
    for (const e of entries) {
      if (excludeId && e.id === excludeId) continue;
      if (!e.endTime) continue;
      const end = e.endTime instanceof Date ? e.endTime : new Date(e.endTime);
      const endMs = end.getTime();
      if (endMs <= ts && endMs > bestMs) {
        bestMs = endMs;
        best = end;
      }
    }
    return best;
  },

  // 获取最早记录的日期（YYYY-MM-DD 格式）
  getEarliestEntryDate: () => {
    const { entries } = get();
    if (entries.length === 0) return null;

    const sorted = [...entries].sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return dayjs(sorted[0].startTime).format('YYYY-MM-DD');
  }
}));
