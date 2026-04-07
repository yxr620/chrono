/**
 * 自动同步推送工具
 * 统一处理数据变更后的自动 Push 逻辑
 *
 * 使用 incrementalPush() 而非直接调用 push()，
 * 确保通过 withSyncGuard 获取 isSyncing 锁，
 * 避免与手动 sync() 并发冲突。
 */

import { syncEngine } from './syncEngine';
import { isSyncReady } from './syncConfig';
import { emitSyncToast, emitSyncStatus } from './syncToast';

/**
 * 异步执行自动 Push，不阻塞调用方。
 * 内部使用 incrementalPush()（带 isSyncing 守卫），
 * 如果正在同步中会安全跳过，不会产生并发冲突。
 * 受自动同步开关控制：开关关闭时不执行。
 * @param context 日志上下文描述（如 "记录完成后"、"添加目标后"）
 */
export function autoPush(context: string): void {
  if (!isSyncReady()) return;

  emitSyncStatus({ phase: 'syncing', direction: 'push' });

  syncEngine.incrementalPush()
    .then(result => {
      if (result.status === 'success' && (result.pushedCount || 0) > 0) {
        console.log(`[AutoSync] ${context}自动 Push，上传 ${result.pushedCount} 条操作`);
        emitSyncStatus({
          phase: 'done',
          direction: 'push',
          pushedCount: result.pushedCount,
        });
      } else if (result.status === 'success') {
        // pushedCount === 0, nothing uploaded — just clear syncing state
        emitSyncStatus({ phase: 'done', direction: 'push', pushedCount: 0 });
      } else if (result.status === 'error') {
        // isSyncing 冲突时静默跳过，其他错误打日志
        if (result.message !== '正在同步中，请稍候') {
          console.warn(`[AutoSync] ${context} Push 跳过: ${result.message}`);
          emitSyncStatus({ phase: 'error', direction: 'push' });
          emitSyncToast({
            message: '自动推送失败',
            color: 'danger',
            duration: 2200
          });
        } else {
          // Syncing conflict — just clear indicator
          emitSyncStatus({ phase: 'done', direction: 'push', pushedCount: 0 });
        }
      }
    })
    .catch(error => {
      console.error(`[AutoSync] ${context} Push 失败:`, error);
      emitSyncStatus({ phase: 'error', direction: 'push' });
      emitSyncToast({
        message: '自动推送失败',
        color: 'danger',
        duration: 2200
      });
    });
}
