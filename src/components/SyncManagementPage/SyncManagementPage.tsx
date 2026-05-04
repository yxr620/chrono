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
import { syncEngine, type SyncResult, type SyncStats } from '../../services/syncEngine';
import { navigateToTab } from '../../services/appNavigation';
import { emitSyncStatus } from '../../services/syncToast';
import type { SyncDirection } from '../../services/syncToast';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { useSyncStore } from '../../stores/syncStore';
import './SyncManagementPage.css';

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

const formatTimestamp = (value: Date | number | null): string => {
  if (!value) {
    return '未同步';
  }

  const timestamp = value instanceof Date ? value.getTime() : value;
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const fetchSyncStats = async (): Promise<SyncStats | null> => {
  try {
    return await syncEngine.getSyncStats();
  } catch (error) {
    console.error('加载同步状态失败:', error);
    return null;
  }
};

export const SyncManagementPage: React.FC = () => {
  const syncMode = useFeatureModeStore((state) => state.modes.sync);
  const autoSyncEnabled = useSyncStore((state) => state.autoSyncEnabled);
  const isConfigured = useSyncStore((state) => state.isConfigured);
  const setAutoSyncEnabled = useSyncStore((state) => state.setAutoSyncEnabled);
  const [presentAlert] = useIonAlert();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [errorHistory, setErrorHistory] = useState<SyncErrorLog[]>([]);
  const [presentToast] = useAppToast();

  useEffect(() => {
    let cancelled = false;

    const loadInitialStats = async () => {
      const data = await fetchSyncStats();
      if (!cancelled) {
        setStats(data);
      }
    };

    void loadInitialStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStats = async () => {
    const data = await fetchSyncStats();
    if (data) {
      setStats(data);
    }
  };

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
      '⚠️ 这将重新上传所有本地数据到云端。适用于 OSS 被清空的恢复场景。确定继续？',
      () => {
        void handleSync(() => syncEngine.forceFullPush(), '强制全量 Push', 'push');
      },
    );
  };

  const handleForceFullPull = () => {
    confirmThenRun(
      '强制全量 Pull',
      '⚠️ 这将拉取并合并所有远程数据。可能会覆盖本地未同步的修改。确定继续？',
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
  const autoSyncDescription = syncMode === 'disabled'
    ? '请先在服务页面启用 BYO 或 Managed 同步，再决定是否自动同步。'
    : !isConfigured
      ? '自动同步偏好会保留；当前同步尚未就绪，完成登录或凭据配置后生效。'
      : '开启后会在数据变更后自动 Push，并在应用启动时自动 Pull。';
  const statusTone = loading
    ? 'syncing'
    : syncMode === 'disabled'
      ? 'disabled'
      : lastResult?.status === 'success'
        ? 'success'
        : lastResult?.status === 'error'
          ? 'error'
          : 'idle';
  const statusLabel = loading
    ? '同步中'
    : syncMode === 'disabled'
      ? '已关闭'
      : lastResult?.status === 'success'
        ? '最近成功'
        : lastResult?.status === 'error'
          ? '最近失败'
          : '等待同步';
  const statusDescription = syncMode === 'disabled'
    ? '多设备同步当前已关闭，可前往「服务」页面重新启用。'
    : !isConfigured
      ? syncMode === 'managed'
        ? '托管同步模式已选中，请先登录 Chrono 账号后再同步。'
        : 'BYO 模式需要有效的 OSS 凭据，请前往服务页面完成配置。'
      : stats && stats.pendingOps > 0
        ? `当前有 ${stats.pendingOps} 条待同步操作。`
        : '当前没有待同步操作。';

  return (
    <div className="sync-status-view">
      <div className="sync-status-banner">
        <div>
          <div className="sync-status-banner-title">凭据配置已移至「服务」页面</div>
          <div className="sync-status-banner-text">在服务页面切换 Off / BYO / Managed，并维护 OSS 凭据。</div>
        </div>
        <button type="button" className="sync-status-link" onClick={() => navigateToTab('export')}>
          打开服务
        </button>
      </div>

      <section className="sync-status-card">
        <div className="sync-status-header">
          <div>
            <h4 className="settings-subsection-title">同步状态</h4>
            <p className="sync-status-subtitle">{statusDescription}</p>
          </div>
          <span className={`sync-status-badge sync-status-badge--${statusTone}`}>{statusLabel}</span>
        </div>

        {!stats ? (
          <div className="sync-status-spinner">
            <IonSpinner />
          </div>
        ) : (
          <div className="settings-stat-list">
            <div className="settings-stat-row">
              <span className="settings-stat-label">服务模式</span>
              <span className="settings-stat-value">{SYNC_MODE_LABEL[syncMode]}</span>
            </div>
            <div className="settings-stat-row">
              <span className="settings-stat-label">最后同步</span>
              <span className="settings-stat-value">{formatTimestamp(stats.lastSyncTime)}</span>
            </div>
            <div className="settings-stat-row">
              <span className="settings-stat-label">未同步操作</span>
              <span className={`settings-stat-value${stats.pendingOps > 0 ? ' settings-stat-value-warn' : ''}`}>
                {stats.pendingOps} 条
              </span>
            </div>
            <div className="settings-stat-row">
              <span className="settings-stat-label">已同步操作</span>
              <span className="settings-stat-value">{stats.syncedOps} 条</span>
            </div>
            <div className="settings-stat-row">
              <span className="settings-stat-label">设备 ID</span>
              <span className="settings-stat-value settings-stat-value-mono">{stats.deviceId.substring(0, 8)}...</span>
            </div>
            <div className="settings-stat-row">
              <span className="settings-stat-label">数据概览</span>
              <span className="settings-stat-value">
                {stats.totalEntries} 条目 / {stats.totalGoals} 目标 / {stats.totalCategories} 分类
              </span>
            </div>
            <div className="settings-stat-row">
              <span className="settings-stat-label">已删除记录</span>
              <span className={`settings-stat-value${totalDeleted > 0 ? ' settings-stat-value-warn' : ''}`}>
                {totalDeleted} 条
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="sync-status-card">
        <div className="sync-status-toggle-row">
          <div>
            <h4 className="settings-subsection-title">自动同步</h4>
            <p className="sync-status-subtitle">{autoSyncDescription}</p>
          </div>
          <IonToggle
            checked={autoSyncEnabled}
            disabled={syncMode === 'disabled'}
            onIonChange={(event) => setAutoSyncEnabled(event.detail.checked)}
            aria-label="自动同步开关"
          />
        </div>
      </section>

      {lastResult && (
        <section className="sync-status-card">
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
        </section>
      )}

      <section className="sync-status-card">
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
      </section>

      <div className="sync-status-actions">
        <IonButton expand="block" onClick={handleSyncNow} disabled={loading} className="settings-action-button">
          {loading ? <IonSpinner name="dots" /> : '立即同步'}
        </IonButton>
        <p className="settings-button-hint">会按照当前服务模式执行同步；若功能已关闭，将返回配置错误但不会导致页面崩溃。</p>
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
