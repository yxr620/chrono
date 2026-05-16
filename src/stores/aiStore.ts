/**
 * AI Store
 * 管理 AI 配置和对话状态
 * 支持多 Provider 配置独立保存与切换
 */

import { create } from 'zustand';
import { AI_PROVIDERS } from '../services/ai/providers';
import { resolveAIDefaultConfig } from '../services/ai/envDefaults';
import type { AssistantDebugInfoPayload } from '../services/ai/debugInfo';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  loading?: boolean;
  error?: boolean;
  /** 已完成的处理阶段列表（顺序累积，最后一项为当前阶段） */
  phases?: Array<{
    key: string;
    detail?: string;
    level?: number;
    failed?: boolean;
    /** 可折叠的详细调试信息（JSON、prompt 文本等） */
    debugInfo?: AssistantDebugInfoPayload;
    /** 阶段开始时间戳（ms），用于计算耗时 */
    at?: number;
    /** 阶段结束时间戳（ms），用于冻结最后一个阶段的耗时 */
    endedAt?: number;
  }>;
}

/** 当前生效的配置（对外接口不变） */
export interface AIConfig {
  providerId: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

/** 每个 Provider 独立保存的配置 */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL: string;
}

/** localStorage 中的持久化结构 */
interface AIConfigStorage {
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
  /** 用户保存的自定义模型名称列表（按 provider 分组） */
  customModels?: Record<string, string[]>;
}

interface AIStore {
  // 配置
  config: AIConfig;
  /** 所有 provider 的独立配置 */
  providerConfigs: Record<string, ProviderConfig>;
  /** 用户保存的自定义模型名称列表（按 provider 分组） */
  customModels: Record<string, string[]>;
  isConfigured: () => boolean;
  updateConfig: (partial: Partial<AIConfig>) => void;
  setProvider: (providerId: string) => void;
  /** 为当前 provider 添加自定义模型名称 */
  addCustomModel: (model: string) => void;
  /** 为当前 provider 删除自定义模型名称 */
  removeCustomModel: (model: string) => void;

  // 对话
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;
  clearMessages: () => void;
}

const STORAGE_KEY = 'ai-config';
const ENV_DEFAULT_CONFIG = resolveAIDefaultConfig(import.meta.env as Record<string, unknown>, AI_PROVIDERS);

/** 为指定 provider 生成默认配置 */
function defaultProviderConfig(providerId: string): ProviderConfig {
  const provider = AI_PROVIDERS.find(p => p.id === providerId);
  const useEnv = providerId === ENV_DEFAULT_CONFIG.providerId;
  return {
    apiKey: useEnv ? ENV_DEFAULT_CONFIG.apiKey : '',
    model: (useEnv ? ENV_DEFAULT_CONFIG.model : '') || provider?.models[0] || '',
    baseURL: (useEnv ? ENV_DEFAULT_CONFIG.baseURL : '') || provider?.baseURL || '',
  };
}

/** 从 localStorage 恢复配置（兼容旧版单配置格式） */
function loadStorage(): AIConfigStorage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);

      // 新格式：含 activeProviderId + providers 字典
      if (parsed.activeProviderId && parsed.providers) {
        return parsed as AIConfigStorage;
      }

      // 旧格式迁移：{ providerId, baseURL, apiKey, model }
      if (parsed.providerId) {
        const old = parsed as AIConfig;
        const storage: AIConfigStorage = {
          activeProviderId: old.providerId,
          providers: {
            [old.providerId]: {
              apiKey: old.apiKey,
              model: old.model,
              baseURL: old.baseURL,
            },
          },
        };
        // 立即写回新格式
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
        return storage;
      }
    }
  } catch { /* ignore */ }

  const defaultId = AI_PROVIDERS[0].id;
  return {
    activeProviderId: defaultId,
    providers: { [defaultId]: defaultProviderConfig(defaultId) },
  };
}

function resolveConfig(storage: AIConfigStorage): AIConfig {
  const fallbackId = ENV_DEFAULT_CONFIG.providerId || AI_PROVIDERS[0].id;
  const id = AI_PROVIDERS.some(p => p.id === storage.activeProviderId)
    ? storage.activeProviderId
    : fallbackId;
  const pc = storage.providers[id] || defaultProviderConfig(id);
  return { providerId: id, baseURL: pc.baseURL, apiKey: pc.apiKey, model: pc.model };
}

function saveStorage(storage: AIConfigStorage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch { /* ignore */ }
}

/** 兼容旧版 customModels（flat string[] → per-provider Record） */
function migrateCustomModels(storage: AIConfigStorage): Record<string, string[]> {
  const cm = storage.customModels;
  if (!cm) return {};
  // 已经是 Record 形式
  if (!Array.isArray(cm)) return cm as Record<string, string[]>;
  // 旧版: flat string[] → 归入 custom provider
  if ((cm as unknown as string[]).length > 0) {
    return { custom: cm as unknown as string[] };
  }
  return {};
}

function normalizeStorage(storage: AIConfigStorage): AIConfigStorage {
  const fallbackId = ENV_DEFAULT_CONFIG.providerId || AI_PROVIDERS[0].id;
  const activeProviderId = AI_PROVIDERS.some(p => p.id === storage.activeProviderId)
    ? storage.activeProviderId
    : fallbackId;

  const providers: Record<string, ProviderConfig> = {};
  for (const p of AI_PROVIDERS) {
    const fromStorage = storage.providers[p.id];
    const defaults = defaultProviderConfig(p.id);
    providers[p.id] = {
      apiKey: fromStorage?.apiKey ?? defaults.apiKey,
      model: fromStorage?.model || defaults.model,
      baseURL: fromStorage?.baseURL || defaults.baseURL,
    };
  }

  return {
    activeProviderId,
    providers,
    customModels: storage.customModels,
  };
}

const initialStorage = normalizeStorage(loadStorage());

export const useAIStore = create<AIStore>((set, get) => ({
  config: resolveConfig(initialStorage),
  providerConfigs: initialStorage.providers,
  customModels: migrateCustomModels(initialStorage),
  messages: [],

  isConfigured: () => {
    const { apiKey, baseURL, model } = get().config;
    return !!(apiKey && baseURL && model);
  },

  updateConfig: (partial) => {
    const prev = get();
    const config = { ...prev.config, ...partial };
    const providerId = config.providerId;

    // 同步更新 providerConfigs
    const prevPc = prev.providerConfigs[providerId] || defaultProviderConfig(providerId);
    const updatedPc: ProviderConfig = {
      apiKey: partial.apiKey ?? prevPc.apiKey,
      model: partial.model ?? prevPc.model,
      baseURL: partial.baseURL ?? prevPc.baseURL,
    };
    const providerConfigs = { ...prev.providerConfigs, [providerId]: updatedPc };

    set({ config, providerConfigs });
    saveStorage({ activeProviderId: providerId, providers: providerConfigs, customModels: prev.customModels });
  },

  setProvider: (providerId) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    const prev = get();

    // 先保存当前 provider 的最新配置
    const currentId = prev.config.providerId;
    const currentPc: ProviderConfig = {
      apiKey: prev.config.apiKey,
      model: prev.config.model,
      baseURL: prev.config.baseURL,
    };
    const providerConfigs = { ...prev.providerConfigs, [currentId]: currentPc };

    // 恢复目标 provider 的配置（若无则用默认值）
    const targetPc = providerConfigs[providerId] || defaultProviderConfig(providerId);
    const config: AIConfig = {
      providerId,
      baseURL: targetPc.baseURL,
      apiKey: targetPc.apiKey,
      model: targetPc.model,
    };

    providerConfigs[providerId] = targetPc;

    set({ config, providerConfigs });
    saveStorage({ activeProviderId: providerId, providers: providerConfigs, customModels: prev.customModels });
  },

  addCustomModel: (model) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    const prev = get();
    const providerId = prev.config.providerId;
    const existing = prev.customModels[providerId] || [];
    if (existing.includes(trimmed)) return;
    const customModels = { ...prev.customModels, [providerId]: [...existing, trimmed] };
    set({ customModels });
    saveStorage({ activeProviderId: providerId, providers: prev.providerConfigs, customModels });
  },

  removeCustomModel: (model) => {
    const prev = get();
    const providerId = prev.config.providerId;
    const existing = prev.customModels[providerId] || [];
    const updated = existing.filter(m => m !== model);
    const customModels = { ...prev.customModels, [providerId]: updated };
    set({ customModels });
    saveStorage({ activeProviderId: providerId, providers: prev.providerConfigs, customModels });
  },

  addMessage: (msg) => {
    const id = crypto.randomUUID();
    const message: ChatMessage = { ...msg, id, timestamp: Date.now() };
    set(s => ({ messages: [...s.messages, message] }));
    return id;
  },

  updateMessage: (id, partial) => {
    set(s => ({
      messages: s.messages.map(m => m.id === id ? { ...m, ...partial } : m),
    }));
  },

  clearMessages: () => set({ messages: [] }),
}));
