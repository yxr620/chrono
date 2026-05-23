import { useEffect, useState } from 'react';
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonItem,
  IonLabel,
  IonSpinner,
  IonToggle,
  useIonAlert,
} from '@ionic/react';
import { useAppToast } from '../../hooks/useAppToast';
import { syncEngine, type SyncResult } from '../../services/syncEngine';
import { emitSyncStatus } from '../../services/syncToast';
import type { SyncDirection } from '../../services/syncToast';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { useSyncStore } from '../../stores/syncStore';
import './SyncManagementPage.css';

import { formatTimestamp, formatRelativeTime } from '../../utils/formatTime';

interface SyncErrorLog {
  id: number;
  message: string;
  time: number;
}

const SYNC_MODE_LABEL: Record<'disabled' | 'byo' | 'managed', string> = {
  disabled: '已关闭',
  byo: '使用我的 OSS 凭据',
  managed: '使用 Chrono 托管同步',
};


export const SyncManagementPage: React.FC = () => {
  const syncMode = useFeatureModeStore((state) => state.modes.sync);
  const autoSyncEnabled = useSyncStore((state) => state.autoSyncEnabled);
  const isConfigured = useSyncStore((state) => state.isConfigured);
  const setAutoSyncEnabled = useSyncStore((state) => state.setAutoSyncEnabled);
  const stats = useSyncStore((state) => state.stats);
  const refreshStats = useSyncStore((state) => state.refreshStats);
  const [presentAlert] = useIonAlert();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [errorHistory, setErrorHistory] = useState<SyncErrorLog[]>([]);
  const [presentToast] = useAppToast();

  // Refresh in background on mount so the cached numbers stay fresh; we don't
  // gate render on this — store already holds the last-known stats.
  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const showToast = (message: string, color: 'success' | 'danger') => {
    presentToast({ message, duration: 2000, position: 'top', color });
  };

  const recordError = (message: string) => {
    setErrorHistory((current) => [
      { id: Date.now(), message, time: Date.now() },
      ...current,
    ].slice(0, 5));
  };

  const handleSync = async (syncFn: () => Promise<SyncResult>, actionName: string, direction: SyncDirection = 'both') => {
    setLoading(true);
    emitSyncStatus({ phase: 'syncing', direction });

    try {
      const result = await syncFn();
      setLastResult(result);
      await refreshStats();

      if (result.status === 'success') {
        emitSyncStatus({
          phase: 'done',
          direction,
          pushedCount: result.pushedCount || 0,
          pulledCount: result.pulledCount || 0,
        });
        showToast(result.message, 'success');
      } else {
        emitSyncStatus({ phase: 'error', direction });
        recordError(result.message);
        showToast(`${actionName}失败`, 'danger');
      }
    } catch (error) {
      console.error(`${actionName} 失败:`, error);
      emitSyncStatus({ phase: 'error', direction });
      recordError(error instanceof Error ? error.message : `${actionName}失败`);
      showToast(`${actionName}失败`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = () => handleSync(() => syncEngine.incrementalSync(), '立即同步', 'both');
  const handleIncrementalPush = () => handleSync(() => syncEngine.incrementalPush(), '增量 Push', 'push');
  const handleIncrementalPull = () => handleSync(() => syncEngine.incrementalPull(), '增量 Pull', 'pull');

  const runMaintenanceAction = async (
    actionName: string,
    operation: () => Promise<string>,
  ) => {
    setLoading(true);

    try {
      const successMessage = await operation();
      await refreshStats();
      showToast(successMessage, 'success');
    } catch (error) {
      console.error(`${actionName}失败:`, error);
      recordError(error instanceof Error ? error.message : `${actionName}失败`);
      showToast(`${actionName}失败`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const confirmThenRun = (
    header: string,
    message: string,
    onConfirm: () => void,
  ) => {
    presentAlert({
      header,
      message,
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '确定', handler: onConfirm },
      ],
    });
  };

  const handleForceFullSync = () => {
    confirmThenRun(
      '强制全量同步',
      '这将重新上传所有本地数据，并拉取所有远程数据。确定继续？',
      () => {
        void handleSync(() => syncEngine.forceFullSync(), '强制全量同步', 'both');
      },
    );
  };

  const handleForceFullPush = () => {
    confirmThenRun(
      '强制全量 Push',
      '这将重新上传所有本地数据到云端。适用于 OSS 被清空的恢复场景。确定继续？',
      () => {
        void handleSync(() => syncEngine.forceFullPush(), '强制全量 Push', 'push');
      },
    );
  };

  const handleForceFullPull = () => {
    confirmThenRun(
      '强制全量 Pull',
      '这将拉取并合并所有远程数据。可能会覆盖本地未同步的修改。确定继续？',
      () => {
        void handleSync(() => syncEngine.forceFullPull(), '强制全量 Pull', 'pull');
      },
    );
  };

  const handleResetSyncState = () => {
    confirmThenRun(
      '重置同步状态',
      '这将清空最后处理的时间戳，下次 Pull 会重新拉取所有文件。确定继续？',
      () => {
        void runMaintenanceAction('重置同步状态', async () => {
          await syncEngine.resetSyncState();
          return '同步状态已重置';
        });
      },
    );
  };

  const handleCleanupLogs = () => {
    confirmThenRun(
      '清理操作日志',
      '这将删除 7 天前的已同步操作日志。确定继续？',
      () => {
        void runMaintenanceAction('清理操作日志', async () => {
          const count = await syncEngine.cleanupSyncedOperations(7);
          return `已清理 ${count} 条操作日志`;
        });
      },
    );
  };

  const handlePurgeDeletedRecords = () => {
    confirmThenRun(
      '清理已删除数据',
      '这将物理删除 30 天前已软删除的记录。确保所有设备都已同步后再执行。确定继续？',
      () => {
        void runMaintenanceAction('清理已删除数据', async () => {
          const result = await syncEngine.purgeDeletedRecords(30);
          const total = result.entries + result.goals + result.categories;
          return `已清理 ${total} 条软删除记录`;
        });
      },
    );
  };

  const totalDeleted = stats
    ? stats.deletedEntries + stats.deletedGoals + stats.deletedCategories
    : 0;
  const hasPersistedSync = !!stats?.lastSyncTime;
  const statusTone = loading
    ? 'syncing'
    : syncMode === 'disabled'
      ? 'disabled'
      : lastResult?.status === 'error'
        ? 'error'
        : lastResult?.status === 'success' || hasPersistedSync
          ? 'success'
          : 'idle';
  const statusLabel = loading
    ? '同步中'
    : syncMode === 'disabled'
      ? '已关闭'
      : lastResult?.status === 'error'
        ? '最近失败'
        : lastResult?.status === 'success' || hasPersistedSync
          ? '最近成功'
          : '等待同步';
  const statusDescription: string | null = syncMode === 'disabled'
    ? '多设备同步当前已关闭，可在下方「多设备同步」卡片重新启用。'
    : !isConfigured
      ? syncMode === 'managed'
        ? '托管同步模式已选中，请先登录 Chrono 账号后再同步。'
        : 'BYO 模式需要有效的 OSS 凭据，请在下方「多设备同步」卡片完成配置。'
      : null;

  const lastSyncRel = formatRelativeTime(stats?.lastSyncTime ?? null);
  const pendingOps = stats?.pendingOps ?? 0;

  // Single status line under the badge. Badge already carries the tone label
  // (最近成功/失败/等待同步), so the line shows only relative time + pending count.
  const statusLine: string | null = (() => {
    if (loading) return '同步中…';
    if (syncMode === 'disabled') return null;
    if (!isConfigured) return null;
    if (statusTone === 'success' || statusTone === 'error') {
      return pendingOps > 0 ? `${lastSyncRel} · ${pendingOps} 条待同步` : lastSyncRel;
    }
    return lastSyncRel;
  })();

  const autoSyncCaption = syncMode === 'disabled'
    ? '先在「多设备同步」启用 BYO 或 Managed'
    : !isConfigured
      ? '完成凭据/登录后自动生效'
      : '数据变更时自动 Push，启动时自动 Pull';

  return (
    <div className="sync-status-view">
      <section className="sync-status-card sync-status-card--main">
        <div className="sync-status-header">
          <span className="sync-status-line-text sync-status-headline">
            {statusLine ?? statusDescription ?? ''}
          </span>
          <span className={`sync-status-badge sync-status-badge--${statusTone}`}>{statusLabel}</span>
        </div>
        <div className="sync-status-line sync-status-line--data">
          <span className="sync-status-line-text">
            {stats
              ? `${stats.totalEntries} 条目 · ${stats.totalGoals} 目标 · ${stats.totalCategories} 分类`
              : ' '}
          </span>
        </div>

        <div className="settings-row sync-status-auto-row">
          <div className="settings-row-text">
            <div className="settings-row-label">自动同步</div>
            <div className="settings-row-sub">{autoSyncCaption}</div>
          </div>
          <IonToggle
            checked={autoSyncEnabled}
            disabled={syncMode === 'disabled'}
            onIonChange={(event) => setAutoSyncEnabled(event.detail.checked)}
            aria-label="自动同步开关"
          />
        </div>

        <div className="sync-status-actions">
          <IonButton expand="block" onClick={handleSyncNow} disabled={loading} className="settings-action-button">
            {loading ? <IonSpinner name="dots" /> : '立即同步'}
          </IonButton>
        </div>
      </section>

      <div className="settings-accordion-wrap">
        <IonAccordionGroup>
          <IonAccordion value="sync-details">
            <IonItem slot="header" lines="none">
              <IonLabel>详情</IonLabel>
            </IonItem>
            <div className="settings-accordion-content" slot="content">
              {stats && (
                <div className="settings-stat-list">
                  <div className="settings-stat-row">
                    <span className="settings-stat-label">服务模式</span>
                    <span className="settings-stat-value">{SYNC_MODE_LABEL[syncMode]}</span>
                  </div>
                  <div className="settings-stat-row">
                    <span className="settings-stat-label">设备 ID</span>
                    <span className="settings-stat-value settings-stat-value-mono">{stats.deviceId.substring(0, 8)}...</span>
                  </div>
                  <div className="settings-stat-row">
                    <span className="settings-stat-label">已同步操作</span>
                    <span className="settings-stat-value">{stats.syncedOps} 条</span>
                  </div>
                  <div className="settings-stat-row">
                    <span className="settings-stat-label">已删除记录</span>
                    <span className={`settings-stat-value${totalDeleted > 0 ? ' settings-stat-value-warn' : ''}`}>
                      {totalDeleted} 条
                    </span>
                  </div>
                </div>
              )}

              {lastResult && (
                <div className="settings-subsection">
                  <h4 className="settings-subsection-title">最近一次同步</h4>
                  <div className="settings-stat-list">
                    <div className="settings-stat-row">
                      <span className="settings-stat-label">状态</span>
                      <span className={`settings-stat-value${lastResult.status === 'error' ? ' settings-stat-value-warn' : ''}`}>
                        {lastResult.status === 'success' ? '成功' : '失败'}
                      </span>
                    </div>
                    <div className="settings-stat-row">
                      <span className="settings-stat-label">消息</span>
                      <span className="settings-stat-value">{lastResult.message}</span>
                    </div>
                    <div className="settings-stat-row">
                      <span className="settings-stat-label">上传</span>
                      <span className="settings-stat-value">{lastResult.pushedCount ?? 0} 条</span>
                    </div>
                    <div className="settings-stat-row">
                      <span className="settings-stat-label">下载</span>
                      <span className="settings-stat-value">{lastResult.pulledCount ?? 0} 条</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="settings-subsection">
                <h4 className="settings-subsection-title">最近错误</h4>
                {errorHistory.length === 0 ? (
                  <p className="sync-status-empty">本次会话暂无同步错误。</p>
                ) : (
                  <div className="sync-status-log">
                    {errorHistory.map((entry) => (
                      <div key={entry.id} className="sync-status-log-item">
                        <span className="sync-status-log-time">{formatTimestamp(entry.time)}</span>
                        <span className="sync-status-log-message">{entry.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </IonAccordion>
        </IonAccordionGroup>
      </div>

      <div className="settings-accordion-wrap">
        <IonAccordionGroup>
          <IonAccordion value="advanced-sync-actions">
            <IonItem slot="header" lines="none">
              <IonLabel>高级同步操作</IonLabel>
            </IonItem>

            <div className="settings-accordion-content" slot="content">
              <div className="settings-subsection">
                <h4 className="settings-subsection-title">增量控制</h4>
                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handleIncrementalPush}
                  disabled={loading}
                  className="settings-action-button"
                >
                  增量 Push
                </IonButton>
                <p className="settings-button-hint">仅上传本地未同步的数据到云端。</p>

                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handleIncrementalPull}
                  disabled={loading}
                  className="settings-action-button"
                >
                  增量 Pull
                </IonButton>
                <p className="settings-button-hint">仅拉取云端新增或变更的数据到本地。</p>
              </div>

              <div className="settings-subsection">
                <h4 className="settings-subsection-title">强制全量同步</h4>
                <p className="settings-subsection-desc">适用于数据恢复、远端重建或同步状态错乱后的手动修复。</p>

                <IonButton
                  expand="block"
                  color="warning"
                  onClick={handleForceFullSync}
                  disabled={loading}
                  className="settings-action-button"
                >
                  强制全量同步
                </IonButton>
                <p className="settings-button-hint">重新上传并重新拉取全部数据。</p>

                <IonButton
                  expand="block"
                  fill="outline"
                  color="warning"
                  onClick={handleForceFullPush}
                  disabled={loading}
                  className="settings-action-button"
                >
                  强制全量 Push
                </IonButton>
                <p className="settings-button-hint">重新上传所有本地数据到云端。</p>

                <IonButton
                  expand="block"
                  fill="outline"
                  color="warning"
                  onClick={handleForceFullPull}
                  disabled={loading}
                  className="settings-action-button"
                >
                  强制全量 Pull
                </IonButton>
                <p className="settings-button-hint">重新拉取并合并所有远程数据。</p>
              </div>

              <div className="settings-subsection">
                <h4 className="settings-subsection-title">维护工具</h4>

                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handleResetSyncState}
                  disabled={loading}
                  className="settings-action-button"
                >
                  重置同步状态
                </IonButton>
                <p className="settings-button-hint">清空时间戳，下次 Pull 会重新扫描全部远端文件。</p>

                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handleCleanupLogs}
                  disabled={loading}
                  className="settings-action-button"
                >
                  清理操作日志
                </IonButton>
                <p className="settings-button-hint">删除 7 天前已完成同步的本地操作日志。</p>

                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handlePurgeDeletedRecords}
                  disabled={loading}
                  className="settings-action-button"
                >
                  清理已删除数据
                </IonButton>
                <p className="settings-button-hint">物理删除 30 天前已软删除的记录。</p>
              </div>
            </div>
          </IonAccordion>
        </IonAccordionGroup>
      </div>
    </div>
  );
};
