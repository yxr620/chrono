import { create } from 'zustand';
import { db, type Category, ensurePresetCategories } from '../services/db';
import { syncDb } from '../services/syncDb';
import { v4 as uuidv4 } from 'uuid';
import { autoPush } from '../services/autoPush';

interface CategoryStore {
  categories: Category[];
  
  loadCategories: () => Promise<void>;
  getCategoryById: (id: string | null) => Category | null;
  getCategoryName: (id: string | null) => string | null;
  getCategoryColor: (id: string | null) => string;

  addCategory: (category: { name: string; color: string; icon?: string }) => Promise<string>;
  updateCategory: (id: string, updates: { name?: string; color?: string; icon?: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],

  loadCategories: async () => {
    let allCategories = await db.categories
      .orderBy('order')
      .toArray();
    if (allCategories.length === 0) {
      await ensurePresetCategories();
      allCategories = await db.categories.orderBy('order').toArray();
    }
    const categories = allCategories.filter(c => !c.deleted);
    set({ categories });
  },

  getCategoryById: (id: string | null) => {
    if (!id) return null;
    return get().categories.find(c => c.id === id) || null;
  },

  getCategoryName: (id: string | null) => {
    if (!id) return null;
    const category = get().categories.find(c => c.id === id);
    return category?.name || null;
  },

  getCategoryColor: (id: string | null) => {
    if (!id) return '#d9d9d9';
    const category = get().categories.find(c => c.id === id);
    return category?.color || '#d9d9d9';
  },

  addCategory: async ({ name, color, icon }) => {
    const now = new Date();
    const maxOrder = get().categories.reduce((max, c) => Math.max(max, c.order), 0);
    const newCategory: Category = {
      id: uuidv4(),
      name,
      color,
      icon,
      order: maxOrder + 1,
      isPreset: false,
      createdAt: now,
      updatedAt: now,
    };
    await syncDb.categories.add(newCategory);
    await get().loadCategories();
    autoPush('after add category');
    return newCategory.id;
  },

  updateCategory: async (id, updates) => {
    await syncDb.categories.update(id, updates);
    await get().loadCategories();
    autoPush('after update category');
  },

  deleteCategory: async (id) => {
    await syncDb.categories.delete(id);
    await get().loadCategories();
    autoPush('after delete category');
  },
}));
