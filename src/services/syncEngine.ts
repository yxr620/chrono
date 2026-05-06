/**
 * Sync Engine
 * 核心同步逻辑：Push（推送）、Pull（拉取）、Merge（合并）
 *
 * 架构：snapshot-first
 *   - 每次 push 同时生成 oplog + snapshot（全量快照）
 *   - 每次 pull 先检查 snapshot（利用 OSS lastModified 跳过未变化的），再叠加 oplog
 *   - snapshot 覆盖范围 ≥ 所有存活 oplog，即使 oplog 被清理也不会丢数据
 *   - LWW (Last-Write-Wins) 合并是幂等的，重复合并无副作用
 */

import { db, type SyncOperation, getDeviceId } from './db';
import {
  uploadSyncFile, listSyncFiles, downloadSyncFile, extractTimestamp,
  uploadSnapshot, downloadSnapshot, listSnapshotFiles, listOwnOplogFiles, deleteOSSFiles,
} from './oss';
import { getSyncUnavailableReason } from './syncAvailability';
import { emitSyncToast, emitSyncStatus } from './syncToast';

// ─── 类型定义 ────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
  status: SyncStatus;
  message: string;
  pushedCount?: number;
  pulledCount?: number;
  error?: Error;
}

export interface SyncStats {
  pendingOps: number;
  syncedOps: number;
  lastSyncTime: Date | null;
  lastProcessedTimestamp: number | null;
  deviceId: string;
  deletedEntries: number;
  deletedGoals: number;
  deletedCategories: number;
  totalEntries: number;
  totalGoals: number;
  totalCategories: number;
}

/** 数据表名类型 */
type TableName = 'entries' | 'goals' | 'categories';

/** 数据表名 → Dexie Table 的映射 */
const TABLE_MAP = {
  entries: () => db.entries,
  goals: () => db.goals,
  categories: () => db.categories,
} as const;

// ─── 同步引擎 ────────────────────────────────────────────

export class SyncEngine {
  private isSyncing = false;
  private lastSyncTime = 0;

  // ─── 公开 API（全部经由 withSyncGuard 保护） ─────────

  /** 完整同步：Push + Pull + 清理 */
  async sync(): Promise<SyncResult> {
    return this.withSyncGuard('同步', async () => {
      const pushedCount = await this.push();
      const pulledCount = await this.pull();
      await this.cleanupSyncedOperations();
      this.lastSyncTime = Date.now();
      return { message: '同步成功', pushedCount, pulledCount };
    });
  }

  /** 增量 Push */
  async incrementalPush(): Promise<SyncResult> {
    return this.withSyncGuard('增量 Push', async () => {
      const pushedCount = await this.push();
      return { message: '增量 Push 完成', pushedCount, pulledCount: 0 };
    });
  }

  /** 增量 Pull */
  async incrementalPull(): Promise<SyncResult> {
    return this.withSyncGuard('增量 Pull', async () => {
      const pulledCount = await this.pull();
      return { message: '增量 Pull 完成', pushedCount: 0, pulledCount };
    });
  }

  /** 增量同步（Push + Pull） */
  async incrementalSync(): Promise<SyncResult> {
    return this.withSyncGuard('增量同步', async () => {
      const pushedCount = await this.push();
      const pulledCount = await this.pull();
      return { message: '增量同步完成', pushedCount, pulledCount };
    });
  }

  /** 强制全量 Push：重新生成全量 oplog + snapshot */
  async forceFullPush(): Promise<SyncResult> {
    return this.withSyncGuard('强制全量 Push', async () => {
      const deviceId = await getDeviceId();
      const entries = await db.entries.toArray();
      const goals = await db.goals.toArray();
      const categories = await db.categories.toArray();

      const operations: SyncOperation[] = [
        ...entries.map(e => this.createSyncOp(deviceId, 'entries', e.id!, e, e.deleted ? 'delete' : 'create')),
        ...goals.map(g => this.createSyncOp(deviceId, 'goals', g.id!, g, g.deleted ? 'delete' : 'create')),
        ...categories.map(c => this.createSyncOp(deviceId, 'categories', c.id, c, c.deleted ? 'delete' : 'create')),
      ];

      if (operations.length > 0) {
        await uploadSyncFile(operations);
      }

      await this.generateAndUploadSnapshot();
      await this.cleanupOwnOplogFiles();

      return { message: '强制全量 Push 完成', pushedCount: operations.length, pulledCount: 0 };
    });
  }

  /** 强制全量 Pull：忽略缓存，重新下载所有 snapshot + oplog */
  async forceFullPull(): Promise<SyncResult> {
    return this.withSyncGuard('强制全量 Pull', async () => {
      let totalOperations = 0;

      totalOperations += await this.pullFromSnapshots(true);

      const files = await listSyncFiles(0);
      for (const file of files) {
        const operations = await downloadSyncFile(file.name);
        for (const op of operations) {
          await this.mergeOperation(op);
          totalOperations++;
        }
      }

      const cursorValue = files.length > 0
        ? extractTimestamp(files[files.length - 1].name)
        : Date.now();
      await this.updateProcessedTimestamp(cursorValue);

      if (totalOperations === 0) {
        return { message: 'OSS 上没有数据', pushedCount: 0, pulledCount: 0 };
      }
      return { message: '强制全量 Pull 完成', pushedCount: 0, pulledCount: totalOperations };
    });
  }

  /** 强制全量同步（Push + Pull） */
  async forceFullSync(): Promise<SyncResult> {
    const pushResult = await this.forceFullPush();
    if (pushResult.status === 'error') return pushResult;

    const pullResult = await this.forceFullPull();
    if (pullResult.status === 'error') return pullResult;

    return {
      status: 'success',
      message: '强制全量同步完成',
      pushedCount: pushResult.pushedCount,
      pulledCount: pullResult.pulledCount,
    };
  }

  /** 获取同步状态 */
  getStatus(): { isSyncing: boolean; lastSyncTime: number } {
    return { isSyncing: this.isSyncing, lastSyncTime: this.lastSyncTime };
  }

  /** 获取同步统计信息 */
  async getSyncStats(): Promise<SyncStats> {
    const [pendingOps, syncedOps, deviceId, lastSync, lastProcessed] = await Promise.all([
      db.syncOperations.filter(op => !op.synced).count(),
      db.syncOperations.filter(op => op.synced).count(),
      getDeviceId(),
      db.syncMetadata.get('lastCloudSyncAt'),
      db.syncMetadata.get('lastProcessedTimestamp'),
    ]);

    const [deletedEntries, deletedGoals, deletedCategories] = await Promise.all([
      db.entries.filter(e => !!e.deleted).count(),
      db.goals.filter(g => !!g.deleted).count(),
      db.categories.filter(c => !!c.deleted).count(),
    ]);

    const [totalEntries, totalGoals, totalCategories] = await Promise.all([
      db.entries.count(), db.goals.count(), db.categories.count(),
    ]);

    return {
      pendingOps, syncedOps, deviceId,
      lastSyncTime: lastSync?.value as Date | null,
      lastProcessedTimestamp: lastProcessed?.value as number | null,
      deletedEntries, deletedGoals, deletedCategories,
      totalEntries, totalGoals, totalCategories,
    };
  }

  /** 重置同步状态（下次 Pull 会重新拉取所有数据） */
  async resetSyncState(): Promise<void> {
    await db.syncMetadata.delete('lastProcessedTimestamp');
    await db.syncMetadata.delete('lastSnapshotPullTimestamps');
    console.log('[Sync] 同步状态已重置');
  }

  /** 清理已同步的本地操作日志 */
  async cleanupSyncedOperations(daysAgo = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const toDelete = await db.syncOperations
      .filter(op => op.synced && op.timestamp < cutoffDate)
      .toArray();

    await Promise.all(toDelete.map(op => db.syncOperations.delete(op.id)));

    console.log(`[Sync] 清理了 ${toDelete.length} 条已同步的操作日志`);
    return toDelete.length;
  }

  /** 物理删除 N 天前的软删除记录 */
  async purgeDeletedRecords(daysAgo = 30): Promise<{ entries: number; goals: number; categories: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const purge = async (table: typeof db.entries | typeof db.goals | typeof db.categories): Promise<number> => {
      const records = await (table as any)
        .filter((r: any) => r.deleted && new Date(r.updatedAt) < cutoffDate)
        .toArray();
      await Promise.all(records.map((r: any) => (table as any).delete(r.id)));
      return records.length;
    };

    const [entries, goals, categories] = await Promise.all([
      purge(db.entries), purge(db.goals), purge(db.categories),
    ]);

    console.log(`[Sync] 清理软删除记录: entries=${entries}, goals=${goals}, categories=${categories}`);
    return { entries, goals, categories };
  }

  // ─── 内部实现 ──────────────────────────────────────────

  /**
   * 同步操作守卫：确保同一时间只有一个同步操作在执行，
   * 统一处理 isSyncing / sync readiness 检查和错误捕获。
   */
  private async withSyncGuard(
    name: string,
    fn: () => Promise<Omit<SyncResult, 'status' | 'error'>>
  ): Promise<SyncResult> {
    if (this.isSyncing) {
      return { status: 'error', message: '正在同步中，请稍候' };
    }
    const blockedReason = getSyncUnavailableReason();
    if (blockedReason) {
      return {
        status: 'error',
        message: blockedReason === '同步功能已关闭' ? blockedReason : `${blockedReason}，无法同步`,
      };
    }
    this.isSyncing = true;
    try {
      console.log(`[Sync] 开始${name}...`);
      const partial = await fn();
      console.log(`[Sync] ${name}完成`);
      await db.syncMetadata.put({
        key: 'lastCloudSyncAt',
        value: new Date(),
        updatedAt: new Date(),
      });
      return { status: 'success', ...partial };
    } catch (error) {
      console.error(`[Sync] ${name}失败:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : `${name}失败`,
        error: error as Error,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Push 内部实现：
   * 压缩操作日志 → 上传 oplog → 标记已同步 → 生成 snapshot → 清理旧 oplog
   */
  private async push(): Promise<number> {
    const allOperations = await db.syncOperations.toArray();
    const operations = allOperations.filter(op => !op.synced);

    if (operations.length === 0) {
      console.log('[Sync] 没有需要上传的操作');
      return 0;
    }

    const compacted = this.compactOperations(operations);
    await uploadSyncFile(compacted);

    await Promise.all(
      operations.map(op => db.syncOperations.update(op.id, { synced: true }))
    );

    await this.generateAndUploadSnapshot();
    await this.cleanupOwnOplogFiles();

    return compacted.length;
  }

  /**
   * Pull 内部实现：
   * 1. 从 snapshot 合并（通过 lastModified 跳过未变化的，零额外开销）
   * 2. 增量处理 oplog
   */
  private async pull(): Promise<number> {
    const lastProcessed = await db.syncMetadata.get('lastProcessedTimestamp');
    const afterTimestamp = lastProcessed ? (lastProcessed.value as number) : 0;

    let totalOperations = 0;

    // 1. snapshot 合并
    totalOperations += await this.pullFromSnapshots();

    // 2. 增量 oplog
    const files = await listSyncFiles(afterTimestamp);
    for (const file of files) {
      const operations = await downloadSyncFile(file.name);
      for (const op of operations) {
        await this.mergeOperation(op);
        totalOperations++;
      }
      await this.updateProcessedTimestamp(extractTimestamp(file.name));
    }

    // 首次同步且仅从 snapshot 获取了数据（无 oplog），设置游标
    if (afterTimestamp === 0 && files.length === 0 && totalOperations > 0) {
      await this.updateProcessedTimestamp(Date.now());
    }

    if (totalOperations === 0) {
      console.log('[Sync] 没有需要拉取的数据');
    }

    return totalOperations;
  }

  /** 压缩操作日志：同一记录只保留最新操作 */
  private compactOperations(operations: SyncOperation[]): SyncOperation[] {
    const latest = new Map<string, SyncOperation>();

    for (const op of operations) {
      const key = `${op.tableName}:${op.recordId}`;
      const existing = latest.get(key);
      if (!existing || new Date(op.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
        latest.set(key, op);
      }
    }

    const compacted = Array.from(latest.values());
    if (compacted.length < operations.length) {
      console.log(`[Sync] 操作压缩: ${operations.length} → ${compacted.length} 条`);
    }
    return compacted;
  }

  /** 生成并上传全量 snapshot（含软删除记录，以传播删除语义） */
  private async generateAndUploadSnapshot(): Promise<void> {
    const deviceId = await getDeviceId();
    const [entries, goals, categories] = await Promise.all([
      db.entries.toArray(), db.goals.toArray(), db.categories.toArray(),
    ]);

    await uploadSnapshot({ deviceId, timestamp: Date.now(), entries, goals, categories });
  }

  /** 清理本设备在 OSS 上的旧 oplog（保留最新 1 个） */
  private async cleanupOwnOplogFiles(): Promise<number> {
    try {
      const files = await listOwnOplogFiles();
      if (files.length <= 1) return 0;

      const toDelete = files.slice(0, files.length - 1);
      await deleteOSSFiles(toDelete.map(f => f.name));
      console.log(`[Sync] 清理了 ${toDelete.length} 个旧 oplog 文件`);
      return toDelete.length;
    } catch (error) {
      console.warn('[Sync] 清理旧 oplog 文件失败（不影响同步）:', error);
      return 0;
    }
  }

  /**
   * 从其他设备的 snapshot 合并数据。
   * 利用 OSS lastModified 跳过未变化的 snapshot，正常情况下零下载开销。
   */
  private async pullFromSnapshots(forceAll = false): Promise<number> {
    const snapshotFiles = await listSnapshotFiles();
    if (snapshotFiles.length === 0) {
      console.log('[Sync] 没有找到其他设备的快照');
      return 0;
    }

    // 读取上次各 snapshot 的 pull 时间戳
    let lastPullTimestamps: Record<string, number> = {};
    if (!forceAll) {
      const meta = await db.syncMetadata.get('lastSnapshotPullTimestamps');
      if (meta) {
        try { lastPullTimestamps = JSON.parse(meta.value as string); } catch { /* ignore */ }
      }
    }

    let totalMerged = 0;
    const newTimestamps = { ...lastPullTimestamps };

    for (const file of snapshotFiles) {
      const modifiedTime = new Date(file.lastModified).getTime();

      if (!forceAll && lastPullTimestamps[file.name] && modifiedTime <= lastPullTimestamps[file.name]) {
        continue;
      }

      const snapshot = await downloadSnapshot(file.name);
      for (const entry of snapshot.entries) {
        if (await this.mergeRecordLWW(db.entries, entry)) totalMerged++;
      }
      for (const goal of snapshot.goals) {
        if (await this.mergeRecordLWW(db.goals, goal)) totalMerged++;
      }
      for (const category of snapshot.categories) {
        if (await this.mergeRecordLWW(db.categories, category)) totalMerged++;
      }

      newTimestamps[file.name] = modifiedTime;
    }

    await db.syncMetadata.put({
      key: 'lastSnapshotPullTimestamps',
      value: JSON.stringify(newTimestamps),
      updatedAt: new Date()
    });

    if (totalMerged > 0) {
      console.log(`[Sync] 从快照合并了 ${totalMerged} 条更新记录`);
    }
    return totalMerged;
  }

  // ─── LWW 合并 ─────────────────────────────────────────

  /**
   * 通用 LWW (Last-Write-Wins) 合并。
   * 比较 updatedAt 时间戳，远程更新则写入本地。
   * snapshot 和 oplog 共用此方法。
   *
   * @returns 是否实际更新了本地数据
   */
  private async mergeRecordLWW(
    table: typeof db.entries | typeof db.goals | typeof db.categories,
    remoteData: any
  ): Promise<boolean> {
    const id = remoteData.id;
    if (!id) return false;

    const record = deserializeDates(remoteData);
    const local = await (table as any).get(id);

    if (!local) {
      await (table as any).put({ ...record, syncStatus: 'synced' });
      return true;
    }

    const remoteTime = new Date(record.updatedAt).getTime();
    const localTime = new Date(local.updatedAt).getTime();

    if (remoteTime > localTime) {
      await (table as any).put({ ...record, syncStatus: 'synced' });
      return true;
    }

    return false;
  }

  /** 合并单个 oplog 操作 */
  private async mergeOperation(operation: SyncOperation): Promise<void> {
    const { tableName, data } = operation;
    try {
      const tableGetter = TABLE_MAP[tableName as TableName];
      if (tableGetter) {
        await this.mergeRecordLWW(tableGetter(), data);
      }
    } catch (error) {
      console.error('[Sync] 合并操作失败:', operation, error);
    }
  }

  // ─── 工具方法 ─────────────────────────────────────────

  /** 创建 SyncOperation 记录 */
  private createSyncOp(
    deviceId: string,
    tableName: TableName,
    recordId: string,
    data: any,
    type: 'create' | 'update' | 'delete' = 'create'
  ): SyncOperation {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      deviceId, tableName, recordId, type, data,
      synced: false,
    };
  }

  /** 更新 lastProcessedTimestamp 游标 */
  private async updateProcessedTimestamp(value: number): Promise<void> {
    await db.syncMetadata.put({
      key: 'lastProcessedTimestamp',
      value,
      updatedAt: new Date()
    });
  }
}

// ─── 工具函数 ──────────────────────────────────────────

/**
 * 将 JSON 反序列化后变成 string 的 Date 字段还原为 Date 对象。
 * JSON.parse 不会自动将 ISO 字符串转换为 Date，需要手动处理。
 */
const DATE_FIELDS = new Set(['startTime', 'endTime', 'createdAt', 'updatedAt', 'timestamp']);

function deserializeDates(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const key of DATE_FIELDS) {
    if (result[key] != null && typeof result[key] === 'string') {
      const d = new Date(result[key]);
      if (!isNaN(d.getTime())) result[key] = d;
    }
  }
  return result;
}

// ─── 导出单例 ──────────────────────────────────────────

export const syncEngine = new SyncEngine();

// ─── 自动同步 ──────────────────────────────────────────

/** 处理自动同步结果的状态指示 + 错误 toast */
function handleAutoSyncResult(result: SyncResult): void {
  if (result.status === 'success') {
    emitSyncStatus({
      phase: 'done',
      direction: 'both',
      pushedCount: result.pushedCount || 0,
      pulledCount: result.pulledCount || 0,
    });
  } else {
    emitSyncStatus({ phase: 'error', direction: 'both' });
    emitSyncToast({
      message: '自动同步失败',
      color: 'danger',
      duration: 2200,
    });
  }
}

/** 启动自动同步（立即执行一次 + 定期执行），返回清理函数 */
export function startAutoSync(intervalMinutes = 10): () => void {
  const run = () => {
    emitSyncStatus({ phase: 'syncing', direction: 'both' });
    syncEngine.sync()
      .then(handleAutoSyncResult)
      .catch(err => {
        console.error('[AutoSync] 自动同步失败:', err);
        emitSyncStatus({ phase: 'error', direction: 'both' });
        emitSyncToast({ message: '自动同步失败', color: 'danger', duration: 2200 });
      });
  };

  run();
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  return () => clearInterval(timer);
}
