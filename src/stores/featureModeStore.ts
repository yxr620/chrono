/**
 * featureModeStore — 每个付费功能的模式（off/byo/managed）
 * 持久化键：localStorage `chrono_feature_modes`
 * 首次启动时若已有 BYO 凭据则种子为 'byo'，否则 'disabled'。
 */

import { create } from 'zustand';
import type { PaidFeatureId, FeatureMode } from '../services/gateway/types';
import { getSavedOSSConfig } from '../services/syncConfig';
import { useAIStore } from './aiStore';

const STORAGE_KEY = 'chrono_feature_modes';

type ModeMap = Record<PaidFeatureId, FeatureMode>;

interface FeatureModeStore {
  modes: ModeMap;
  setMode: (id: PaidFeatureId, mode: FeatureMode) => void;
  loadFromStorage: () => void;
}

const DEFAULT_MODES: ModeMap = { sync: 'disabled', ai: 'disabled' };

function readStorage(): Partial<ModeMap> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<ModeMap>;
  } catch {
    console.warn('[featureModeStore] corrupt data in', STORAGE_KEY, '— re-seeding');
    return null;
  }
}

function writeStorage(modes: ModeMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modes));
}

function seedFromExistingCredentials(): ModeMap {
  const seeded: ModeMap = { ...DEFAULT_MODES };
  if (getSavedOSSConfig() || import.meta.env.VITE_OSS_ACCESS_KEY_ID) {
    seeded.sync = 'byo';
  }
  const ai = useAIStore.getState();
  if (ai.isConfigured()) {
    seeded.ai = 'byo';
  }
  return seeded;
}

export const useFeatureModeStore = create<FeatureModeStore>((set, get) => ({
  modes: DEFAULT_MODES,

  setMode: (id, mode) => {
    const next = { ...get().modes, [id]: mode };
    writeStorage(next);
    set({ modes: next });
  },

  loadFromStorage: () => {
    const stored = readStorage();
    if (stored) {
      // Storage exists — respect persisted state. Seeding only runs on
      // first boot; later credential changes flip modes via setMode.
      set({ modes: { ...DEFAULT_MODES, ...stored } });
      return;
    }
    const seeded = seedFromExistingCredentials();
    writeStorage(seeded);
    set({ modes: seeded });
  },
}));
