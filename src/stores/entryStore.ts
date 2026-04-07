import { create } from 'zustand';
import dayjs from 'dayjs';
import { db, type TimeEntry } from '../services/db';
import { dataService } from '../services/dataService';
import { autoPush } from '../services/autoPush';

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
  setTimeRange: (startTime: Date, endTime: Date) => void;
  getLastEntryEndTime: () => Date | null;
  getLastEntryEndTimeForDate: (date: string) => Date | null;
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

  getLastEntryEndTimeForDate: (date: string) => {
    const { entries } = get();
    const dayStart = dayjs(date).startOf('day');
    const dayEnd = dayjs(date).endOf('day');

    // 筛选该日期内的已完成记录
    const dateEntries = entries.filter(e => {
      if (!e.endTime) return false;
      const entryStart = dayjs(e.startTime);
      // 记录的开始时间在当天范围内
      return entryStart.isAfter(dayStart) && entryStart.isBefore(dayEnd);
    });

    if (dateEntries.length === 0) return null;

    // 按结束时间排序，取最新的
    const sortedByEndTime = dateEntries.sort((a, b) =>
      new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime()
    );

    return sortedByEndTime[0].endTime;
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
