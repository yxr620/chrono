import Dexie, { type Table } from 'dexie';
import { PRESET_CATEGORIES } from '../config/categoryColors';

// === Sync-related interfaces ===
export interface Syncable {
  version?: number;                // 版本号，每次修改 +1
  deviceId?: string;               // 修改设备的 ID
  syncStatus?: 'synced' | 'pending'; // 同步状态
  deleted?: boolean;               // 软删除标记
}

export interface TimeEntry extends Syncable {
  id?: string;
  startTime: Date;
  endTime: Date | null;
  activity: string;
  categoryId: string | null;  // 活动类别（可选，兼容旧数据）
  goalId: string | null;
  customFields?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 目标类型
 *  - 'time'  : 时间投入型目标（默认）。与 entries 关联，按计时累计时长。
 *  - 'check' : 打卡/提醒型目标。如"吃药""早点睡"，只追踪是否完成，不参与时长统计。
 *
 * 兼容性：缺省/未知 type 一律按 'time' 处理；旧版本读到新字段会忽略，不影响任何已有功能。
 */
export type GoalType = 'time' | 'check';

export interface Goal extends Syncable {
  id?: string;
  name: string;
  date: string;
  color?: string;
  /** 目标类型，缺省视为 'time' */
  type?: GoalType;
  /** 仅 type === 'check' 时使用 */
  completed?: boolean;
  /** 仅 type === 'check' 时使用，标记最近一次完成的时间 */
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category extends Syncable {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
  isPreset?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncMetadata {
  key: string;
  value: string | number | Date;
  updatedAt: Date;
}

export interface SyncOperation {
  id: string;                      // UUID
  timestamp: Date;                 // 操作发生时间
  deviceId: string;                // 操作设备
  tableName: 'entries' | 'goals' | 'categories';
  recordId: string;                // 记录 ID
  type: 'create' | 'update' | 'delete';
  data: any;                       // 变更后的完整数据
  synced: boolean;                 // 是否已上传
}

export class TimeTrackerDB extends Dexie {
  entries!: Table<TimeEntry, string>;
  goals!: Table<Goal, string>;
  categories!: Table<Category, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  syncOperations!: Table<SyncOperation, string>;

  constructor() {
    super('TimeTrackerDB');
    this.version(1).stores({
      entries: 'id, startTime, endTime, activity, goalId, createdAt',
      goals: 'id, name, date, createdAt'
    });
    
    // 添加同步元数据表
    this.version(2).stores({
      entries: 'id, startTime, endTime, activity, goalId, createdAt',
      goals: 'id, name, date, createdAt',
      syncMetadata: 'key, updatedAt'
    });

    // 添加类别表和更新entries表
    this.version(3).stores({
      entries: 'id, startTime, endTime, activity, categoryId, goalId, createdAt',
      goals: 'id, name, date, createdAt',
      categories: 'id, name, order',
      syncMetadata: 'key, updatedAt'
    }).upgrade(async tx => {
      // 初始化预设类别
      const now = new Date();
      const categories: Category[] = [
        { id: 'study', name: '学习', color: '#1890FF', order: 1, isPreset: true, createdAt: now, updatedAt: now },
        { id: 'work', name: '工作', color: '#40A9FF', order: 2, isPreset: true, createdAt: now, updatedAt: now },
        { id: 'daily', name: '日常', color: '#FFA940', order: 3, isPreset: true, createdAt: now, updatedAt: now },
        { id: 'exercise', name: '运动', color: '#FF7A45', order: 4, isPreset: true, createdAt: now, updatedAt: now },
        { id: 'rest', name: '休息', color: '#9254DE', order: 5, isPreset: true, createdAt: now, updatedAt: now },
        { id: 'entertainment', name: '娱乐', color: '#B37FEB', order: 6, isPreset: true, createdAt: now, updatedAt: now }
      ];
      
      await tx.table('categories').bulkAdd(categories);
    });

    // 添加同步支持（Version 4）
    this.version(4).stores({
      entries: 'id, startTime, endTime, activity, categoryId, goalId, createdAt',
      goals: 'id, name, date, createdAt',
      categories: 'id, name, order',
      syncMetadata: 'key, updatedAt',
      syncOperations: 'id, timestamp, deviceId, tableName, synced'
    }).upgrade(async tx => {
      // 为现有数据添加默认值（向后兼容）
      const entries = await tx.table('entries').toArray();
      for (const entry of entries) {
        if (!entry.version) {
          await tx.table('entries').update(entry.id!, {
            version: 1,
            syncStatus: 'synced'
          });
        }
      }

      const goals = await tx.table('goals').toArray();
      for (const goal of goals) {
        if (!goal.version) {
          await tx.table('goals').update(goal.id!, {
            version: 1,
            syncStatus: 'synced'
          });
        }
      }

      const categories = await tx.table('categories').toArray();
      for (const category of categories) {
        if (!category.version) {
          await tx.table('categories').update(category.id, {
            version: 1,
            syncStatus: 'synced',
            updatedAt: new Date()
          });
        }
      }

      // 初始化 deviceId
      const existingDeviceId = await tx.table('syncMetadata').get('deviceId');
      if (!existingDeviceId) {
        await tx.table('syncMetadata').add({
          key: 'deviceId',
          value: crypto.randomUUID(),
          updatedAt: new Date()
        });
      }
    });

    // Seed preset categories when the database is first created
    this.on('populate', (tx) => {
      const now = new Date();
      const presets = Object.values(PRESET_CATEGORIES).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        order: p.order,
        isPreset: true,
        createdAt: now,
        updatedAt: now,
      }));
      tx.table('categories').bulkAdd(presets);
    });

    // 自定义类别支持：将颜色存入数据库，标记预设类别
    this.version(5).stores({
      entries: 'id, startTime, endTime, activity, categoryId, goalId, createdAt',
      goals: 'id, name, date, createdAt',
      categories: 'id, name, order',
      syncMetadata: 'key, updatedAt',
      syncOperations: 'id, timestamp, deviceId, tableName, synced'
    }).upgrade(async tx => {
      const PRESET_COLORS: Record<string, string> = {
        study: '#1890FF',
        work: '#40A9FF',
        daily: '#FFA940',
        exercise: '#FF7A45',
        rest: '#9254DE',
        entertainment: '#B37FEB',
      };
      const categories = await tx.table('categories').toArray();
      for (const category of categories) {
        const isPreset = category.id in PRESET_COLORS;
        await tx.table('categories').update(category.id, {
          color: PRESET_COLORS[category.id] || '#d9d9d9',
          isPreset,
        });
      }
    });

    // 目标类型支持（time / check）：所有旧目标默认补 type='time'，行为完全等同升级前。
    // 注意：goals 索引保持不变（不需要按 type 查询，前端在内存中过滤即可）。
    this.version(6).stores({
      entries: 'id, startTime, endTime, activity, categoryId, goalId, createdAt',
      goals: 'id, name, date, createdAt',
      categories: 'id, name, order',
      syncMetadata: 'key, updatedAt',
      syncOperations: 'id, timestamp, deviceId, tableName, synced'
    }).upgrade(async tx => {
      const goals = await tx.table('goals').toArray();
      for (const goal of goals) {
        if (!goal.type) {
          await tx.table('goals').update(goal.id!, { type: 'time' as const });
        }
      }
    });
  }
}

export const db = new TimeTrackerDB();

/**
 * Ensure preset categories exist in the database.
 * Called as a safety net during loadCategories.
 */
export async function ensurePresetCategories(): Promise<void> {
  const existing = await db.categories.toArray();
  const existingIds = new Set(existing.map(c => c.id));
  const now = new Date();
  const missing = Object.values(PRESET_CATEGORIES)
    .filter(p => !existingIds.has(p.id))
    .map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      order: p.order,
      isPreset: true,
      createdAt: now,
      updatedAt: now,
    }));
  if (missing.length > 0) {
    await db.categories.bulkAdd(missing);
  }
}

// === Sync helper functions ===

/**
 * 获取当前设备 ID
 */
export async function getDeviceId(): Promise<string> {
  const metadata = await db.syncMetadata.get('deviceId');
  if (metadata) {
    return metadata.value as string;
  }
  
  // 如果没有设备 ID，创建一个新的
  const deviceId = crypto.randomUUID();
  await db.syncMetadata.add({
    key: 'deviceId',
    value: deviceId,
    updatedAt: new Date()
  });
  return deviceId;
}

/**
 * 记录同步操作
 */
export async function logSyncOperation(
  tableName: 'entries' | 'goals' | 'categories',
  recordId: string,
  type: 'create' | 'update' | 'delete',
  data: any
): Promise<void> {
  const deviceId = await getDeviceId();
  
  const operation: SyncOperation = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    deviceId,
    tableName,
    recordId,
    type,
    data,
    synced: false
  };
  
  await db.syncOperations.add(operation);
}

/**
 * 更新记录的同步元数据
 */
export function updateSyncMetadata(data: any, deviceId: string): any {
  return {
    ...data,
    version: (data.version || 0) + 1,
    deviceId,
    syncStatus: 'pending' as const,
    updatedAt: new Date()
  };
}
