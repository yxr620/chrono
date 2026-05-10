/**
 * Sync Store
 * 管理同步状态，供 UI 使用
 */

import { create } from 'zustand';
import { syncEngine, type SyncStatus, type SyncResult, type SyncStats, startAutoSync } from '../services/syncEngine';
import {
  isAutoSyncEnabled as getAutoSyncEnabled,
  setAutoSyncEnabled as persistAutoSyncEnabled,
} from '../services/syncConfig';
import { isSyncConfigured } from '../services/syncAvailability';

interface SyncStore {
  status: SyncStatus;
  message: string;
  lastSyncTime: number | null;
  pushedCount: number;
  pulledCount: number;
  isConfigured: boolean;
  autoSyncEnabled: boolean;
  stats: SyncStats | null;

  // 方法
  sync: () => Promise<void>;
  checkConfig: () => void;
  refreshStats: () => Promise<void>;
  setAutoSyncEnabled: (enabled: boolean) => void;
  startAutoSync: (intervalMinutes?: number) => void;
  stopAutoSync: () => void;
}

let autoSyncCleanup: (() => void) | null = null;

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: 'idle',
  message: '',
  lastSyncTime: null,
  pushedCount: 0,
  pulledCount: 0,
  isConfigured: isSyncConfigured(),
  autoSyncEnabled: getAutoSyncEnabled(),
  stats: null,

  sync: async () => {
    try {
      set({ status: 'syncing', message: '正在同步...' });

      const result: SyncResult = await syncEngine.sync();

      set({
        status: result.status,
        message: result.message,
        lastSyncTime: result.status === 'success' ? Date.now() : get().lastSyncTime,
        pushedCount: result.pushedCount || 0,
        pulledCount: result.pulledCount || 0
      });

      // 2秒后重置状态
      if (result.status === 'success') {
        setTimeout(() => {
          set({ status: 'idle', message: '' });
        }, 2000);
      }
    } catch (error) {
      console.error('[SyncStore] 同步失败:', error);
      set({
        status: 'error',
        message: error instanceof Error ? error.message : '同步失败'
      });
    }
  },

  checkConfig: () => {
    try {
      set({
        isConfigured: isSyncConfigured(),
        autoSyncEnabled: getAutoSyncEnabled(),
      });
    } catch (error) {
      console.error('[SyncStore] 检查配置失败:', error);
      set({ isConfigured: false, autoSyncEnabled: false });
    }
  },

  refreshStats: async () => {
    try {
      const data = await syncEngine.getSyncStats();
      set({ stats: data });
    } catch (error) {
      console.error('[SyncStore] 加载同步统计失败:', error);
    }
  },

  setAutoSyncEnabled: (enabled: boolean) => {
    persistAutoSyncEnabled(enabled);
    set({ autoSyncEnabled: enabled });
  },

  startAutoSync: (intervalMinutes = 10) => {
    if (autoSyncCleanup) {
      autoSyncCleanup();
    }
    autoSyncCleanup = startAutoSync(intervalMinutes);
  },

  stopAutoSync: () => {
    if (autoSyncCleanup) {
      autoSyncCleanup();
      autoSyncCleanup = null;
    }
  }
}));
