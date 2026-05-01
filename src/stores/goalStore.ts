import { create } from 'zustand';
import { db, type Goal } from '../services/db';
import { dataService } from '../services/dataService';
import { autoPush } from '../services/autoPush';

interface GoalStore {
  goals: Goal[];
  
  loadGoals: () => Promise<void>;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  toggleCompletion: (id: string) => Promise<void>;
  getGoalsByDate: (date: string) => Goal[];
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: [],

  loadGoals: async () => {
    const allGoals = await db.goals.toArray();
    // 过滤掉软删除的记录
    const goals = allGoals.filter(g => !g.deleted);
    set({ goals });
  },

  addGoal: async (goal) => {
    await dataService.goals.add(goal);
    await get().loadGoals();
    autoPush('添加目标后');
  },

  updateGoal: async (id, updates) => {
    await dataService.goals.update(id, updates);
    await get().loadGoals();
    autoPush('更新目标后');
  },

  deleteGoal: async (id) => {
    await dataService.goals.delete(id);
    await get().loadGoals();
    autoPush('删除目标后');
  },

  toggleCompletion: async (id) => {
    await dataService.goals.toggleCompletion(id);
    await get().loadGoals();
    autoPush('切换打卡目标完成状态后');
  },

  getGoalsByDate: (date: string) => {
    return get().goals.filter(g => g.date === date);
  }
}));
