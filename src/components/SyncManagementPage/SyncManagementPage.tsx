import { useState, useEffect } from 'react';
import {
  IonButton,
  IonSpinner,
  IonToggle,
  useIonAlert,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel
} from '@ionic/react';
import { syncEngine, type SyncStats, type SyncResult } from '../../services/syncEngine';
import { isOSSConfigured, getOSSConfig } from '../../services/oss';
import { useSyncStore } from '../../stores/syncStore';
import { emitSyncStatus } from '../../services/syncToast';
import type { SyncDirection } from '../../services/syncToast';
import { useAppToast } from '../../hooks/useAppToast';
import {
  getSavedOSSConfig,
  saveOSSConfig as persistOSSConfig,
  clearOSSConfig as removeOSSConfig,
  type OSSConfig,
} from '../../services/syncConfig';
import './SyncManagementPage.css';

export const SyncManagementPage: React.FC = () => {
  const { autoSyncEnabled, setAutoSyncEnabled, checkConfig } = useSyncStore();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showOSSForm, setShowOSSForm] = useState(false);
  const [ossForm, setOSSForm] = useState<OSSConfig>({
    region: '', bucket: '', accessKeyId: '', accessKeySecret: ''
  });
  const [configSource, setConfigSource] = useState<'manual' | 'env' | 'none'>('none');
  const [presentAlert] = useIonAlert();
  const [presentToast] = useAppToast();

  useEffect(() => {
    loadStats();
    const configured = isOSSConfigured();
    setIsConfigured(configured);
    if (!configured) setShowOSSForm(true);
    const saved = getSavedOSSConfig();
    if (saved) {
      setOSSForm(saved);
      setConfigSource('manual');
    } else {
      const envConfig = getOSSConfig();
      const hasEnv = !!(envConfig.accessKeyId || envConfig.bucket || envConfig.region !== 'oss-cn-hangzhou');
      if (hasEnv) {
        setOSSForm({
          region: envConfig.region,
          bucket: envConfig.bucket,
          accessKeyId: envConfig.accessKeyId,
          accessKeySecret: envConfig.accessKeySecret,
        });
        setConfigSource('env');
      }
    }
  }, []);

  const loadStats = async () => {
    try {
      const data = await syncEngine.getSyncStats();
      setStats(data);
    } catch (error) {
      console.error('加载同步状态失败:', error);
    }
  };

  const showToast = (message: string, color: 'success' | 'danger') => {
    presentToast({ message, duration: 2000, position: 'top', color });
  };

  const handleSync = async (syncFn: () => Promise<SyncResult>, actionName: string, direction: SyncDirection = 'both') => {
    setLoading(true);
    emitSyncStatus({ phase: 'syncing', direction });
    try {
      const result = await syncFn();
      setLastResult(result);
      await loadStats();

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
        showToast(`${actionName}失败`, 'danger');
      }
    } catch (error) {
      console.error(`${actionName} 失败:`, error);
      emitSyncStatus({ phase: 'error', direction });
      showToast(`${actionName}失败`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleIncrementalSync = () => handleSync(() => syncEngine.incrementalSync(), '增量同步', 'both');
  const handleIncrementalPush = () => handleSync(() => syncEngine.incrementalPush(), '增量 Push', 'push');
  const handleIncrementalPull = () => handleSync(() => syncEngine.incrementalPull(), '增量 Pull', 'pull');

  const handleForceFullSync = () => {
    presentAlert({
      header: '强制全量同步',
      message: '这将重新上传所有本地数据，并拉取所有远程数据。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '确定', handler: () => handleSync(() => syncEngine.forceFullSync(), '强制全量同步') }
      ]
    });
  };

  const handleForceFullPush = () => {
    presentAlert({
      header: '强制全量 Push',
      message: '⚠️ 这将重新上传所有本地数据到云端。适用于 OSS 被清空的恢复场景。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '确定', handler: () => handleSync(() => syncEngine.forceFullPush(), '强制全量 Push') }
      ]
    });
  };

  const handleForceFullPull = () => {
    presentAlert({
      header: '强制全量 Pull',
      message: '⚠️ 这将拉取并合并所有远程数据。可能会覆盖本地未同步的修改。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '确定', handler: () => handleSync(() => syncEngine.forceFullPull(), '强制全量 Pull') }
      ]
    });
  };

  const handleResetSyncState = () => {
    presentAlert({
      header: '重置同步状态',
      message: '这将清空最后处理的时间戳，下次 Pull 会重新拉取所有文件。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: async () => {
            try {
              await syncEngine.resetSyncState();
              await loadStats();
              showToast('同步状态已重置', 'success');
            } catch (error) {
              console.error('重置同步状态失败:', error);
              showToast('重置失败', 'danger');
            }
          }
        }
      ]
    });
  };

  const handleCleanupLogs = () => {
    presentAlert({
      header: '清理操作日志',
      message: '这将删除 7 天前的已同步操作日志。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: async () => {
            try {
              const count = await syncEngine.cleanupSyncedOperations(7);
              await loadStats();
              showToast(`已清理 ${count} 条操作日志`, 'success');
            } catch (error) {
              console.error('清理操作日志失败:', error);
              showToast('清理失败', 'danger');
            }
          }
        }
      ]
    });
  };

  const handlePurgeDeletedRecords = () => {
    presentAlert({
      header: '清理已删除数据',
      message: '这将物理删除 30 天前已软删除的记录。确保所有设备都已同步后再执行。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: async () => {
            setLoading(true);
            try {
              const result = await syncEngine.purgeDeletedRecords(30);
              const total = result.entries + result.goals + result.categories;
              await loadStats();
              showToast(`已清理 ${total} 条软删除记录`, 'success');
            } catch (error) {
              console.error('清理已删除数据失败:', error);
              showToast('清理失败', 'danger');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    });
  };

  const handleSaveOSSConfig = () => {
    if (!ossForm.bucket || !ossForm.accessKeyId || !ossForm.accessKeySecret) {
      showToast('请填写必要的 OSS 配置', 'danger');
      return;
    }
    const config: OSSConfig = {
      region: ossForm.region || 'oss-cn-hangzhou',
      bucket: ossForm.bucket,
      accessKeyId: ossForm.accessKeyId,
      accessKeySecret: ossForm.accessKeySecret,
    };
    persistOSSConfig(config);
    setIsConfigured(true);
    setShowOSSForm(false);
    setConfigSource('manual');
    checkConfig();
    loadStats();
    showToast('OSS 配置已保存', 'success');
  };

  const handleClearOSSConfig = () => {
    presentAlert({
      header: '清除 OSS 配置',
      message: '清除后将回退到 .env 环境变量配置。如果 .env 中没有配置，同步功能将被禁用。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定清除',
          handler: () => {
            removeOSSConfig();
            const envConfig = getOSSConfig();
            const hasEnv = !!(envConfig.accessKeyId || envConfig.bucket);
            if (hasEnv) {
              setOSSForm({
                region: envConfig.region,
                bucket: envConfig.bucket,
                accessKeyId: envConfig.accessKeyId,
                accessKeySecret: envConfig.accessKeySecret,
              });
              setConfigSource('env');
            } else {
              setOSSForm({ region: '', bucket: '', accessKeyId: '', accessKeySecret: '' });
              setConfigSource('none');
            }
            const nowConfigured = isOSSConfigured();
            setIsConfigured(nowConfigured);
            if (!nowConfigured) setShowOSSForm(true);
            checkConfig();
            showToast('OSS 配置已清除', 'success');
          }
        }
      ]
    });
  };

  // ─── Sub-renderers ────────────────────────────────────────────────

  const renderOSSForm = () => (
    <div>
      {configSource === 'env' && (
        <div className="settings-banner settings-banner-info">
          📋 当前使用 .env 环境变量配置，修改后将保存为应用内配置
        </div>
      )}
      {configSource === 'manual' && isConfigured && (
        <div className="settings-banner settings-banner-success">
          ✅ 当前使用应用内手动配置
        </div>
      )}
      {!isConfigured && configSource === 'none' && (
        <div className="settings-banner settings-banner-muted">
          请输入阿里云 OSS 配置信息以启用同步功能
        </div>
      )}
      <div className="settings-input-group">
        <div>
          <label className="settings-input-label">Region</label>
          <input
            type="text"
            className="settings-input-field"
            value={ossForm.region}
            onChange={(e) => setOSSForm(f => ({ ...f, region: e.target.value }))}
            placeholder="oss-cn-hangzhou"
          />
        </div>
        <div>
          <label className="settings-input-label">Bucket</label>
          <input
            type="text"
            className="settings-input-field"
            value={ossForm.bucket}
            onChange={(e) => setOSSForm(f => ({ ...f, bucket: e.target.value }))}
            placeholder="your-bucket-name"
          />
        </div>
        <div>
          <label className="settings-input-label">AccessKey ID</label>
          <input
            type="password"
            className="settings-input-field"
            value={ossForm.accessKeyId}
            onChange={(e) => setOSSForm(f => ({ ...f, accessKeyId: e.target.value }))}
            placeholder="your-access-key-id"
          />
        </div>
        <div>
          <label className="settings-input-label">AccessKey Secret</label>
          <input
            type="password"
            className="settings-input-field"
            value={ossForm.accessKeySecret}
            onChange={(e) => setOSSForm(f => ({ ...f, accessKeySecret: e.target.value }))}
            placeholder="your-access-key-secret"
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <IonButton
            expand="block"
            onClick={handleSaveOSSConfig}
            className="settings-action-button"
            style={{ flex: 1 }}
          >
            💾 保存配置
          </IonButton>
          {isConfigured && (
            <IonButton
              fill="outline"
              onClick={() => setShowOSSForm(false)}
              className="settings-action-button"
            >
              取消
            </IonButton>
          )}
        </div>
        {isConfigured && (
          <IonButton
            expand="block"
            fill="outline"
            color="danger"
            onClick={handleClearOSSConfig}
            className="settings-action-button"
          >
            🗑️ 清除应用内配置
          </IonButton>
        )}
      </div>
    </div>
  );

  const renderSyncStats = () => {
    if (!stats) {
      return (
        <div style={{ textAlign: 'center', padding: '12px' }}>
          <IonSpinner />
        </div>
      );
    }
    const totalDeleted = stats.deletedEntries + stats.deletedGoals + stats.deletedCategories;
    return (
      <div className="settings-stat-list">
        <div className="settings-stat-row">
          <span className="settings-stat-label">OSS 配置</span>
          <span
            className="settings-stat-value settings-stat-value-link"
            onClick={() => setShowOSSForm(true)}
          >
            ✅ 已配置（点击修改）
          </span>
        </div>
        <div className="settings-stat-row">
          <span className="settings-stat-label">设备 ID</span>
          <span className="settings-stat-value settings-stat-value-mono">
            {stats.deviceId.substring(0, 8)}...
          </span>
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
          <span className="settings-stat-label">数据记录</span>
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
    );
  };

  const renderLastResult = () => {
    if (!lastResult) return null;
    return (
      <div className="settings-sync-result">
        <h4 className="settings-subsection-title">最近同步结果</h4>
        <div className="settings-stat-list">
          <div className="settings-stat-row">
            <span className="settings-stat-label">状态</span>
            <span
              className="settings-stat-value"
              style={{ color: lastResult.status === 'success' ? 'hsl(142 76% 36%)' : 'hsl(var(--destructive))' }}
            >
              {lastResult.status === 'success' ? '✅ 成功' : '❌ 失败'}
            </span>
          </div>
          <div className="settings-stat-row">
            <span className="settings-stat-label">消息</span>
            <span className="settings-stat-value">{lastResult.message}</span>
          </div>
          {lastResult.pushedCount !== undefined && (
            <div className="settings-stat-row">
              <span className="settings-stat-label">上传</span>
              <span className="settings-stat-value">↑ {lastResult.pushedCount} 条</span>
            </div>
          )}
          {lastResult.pulledCount !== undefined && (
            <div className="settings-stat-row">
              <span className="settings-stat-label">下载</span>
              <span className="settings-stat-value">↓ {lastResult.pulledCount} 条</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────

  // First-time setup or explicit edit: show form full-width
  if (!isConfigured || showOSSForm) {
    return (
      <div>
        <h4 className="settings-subsection-title" style={{ marginBottom: '8px' }}>
          {isConfigured ? '修改 OSS 配置' : 'OSS 配置'}
        </h4>
        {renderOSSForm()}
      </div>
    );
  }

  // Configured: always-visible primary block + accordion for the rest
  return (
    <div className="sync-primary-block">
      <div className="settings-row">
        <div className="settings-row-text">
          <div className="settings-row-label">自动同步</div>
          <div className="settings-row-sub">数据变更自动推送，启动时自动拉取</div>
        </div>
        <IonToggle checked={autoSyncEnabled} onIonChange={(e) => setAutoSyncEnabled(e.detail.checked)} />
      </div>

      <div className="sync-primary-buttons">
        <IonButton
          expand="block"
          onClick={handleIncrementalSync}
          disabled={loading}
          className="settings-action-button"
        >
          {loading ? <IonSpinner name="dots" /> : '🔄 增量同步 (Push + Pull)'}
        </IonButton>
        <p className="settings-button-hint">同步本地和云端的增量数据</p>

        <IonButton
          expand="block"
          fill="outline"
          onClick={handleIncrementalPush}
          disabled={loading}
          className="settings-action-button"
        >
          ⬆️ 增量 Push
        </IonButton>
        <p className="settings-button-hint">上传本地未同步的数据到云端</p>

        <IonButton
          expand="block"
          fill="outline"
          onClick={handleIncrementalPull}
          disabled={loading}
          className="settings-action-button"
        >
          ⬇️ 增量 Pull
        </IonButton>
        <p className="settings-button-hint">下载云端的增量数据到本地</p>
      </div>

      <div className="settings-accordion-wrap">
        <IonAccordionGroup>
          <IonAccordion value="advanced">
            <IonItem slot="header" lines="none">
              <IonLabel>高级与同步状态</IonLabel>
            </IonItem>
            <div className="settings-accordion-content" slot="content">
              <div className="settings-subsection">
                <h4 className="settings-subsection-title">同步状态</h4>
                {renderSyncStats()}
              </div>

              <div className="settings-subsection">
                <h4 className="settings-subsection-title">强制全量同步</h4>
                <p className="settings-subsection-desc">⚠️ 适用于数据恢复或重建同步状态的场景</p>
                <IonButton
                  expand="block"
                  color="warning"
                  onClick={handleForceFullSync}
                  disabled={loading}
                  className="settings-action-button"
                >
                  ⚠️ 强制全量同步 (Push + Pull)
                </IonButton>
                <p className="settings-button-hint">重新上传并拉取所有数据</p>
                <IonButton
                  expand="block"
                  fill="outline"
                  color="warning"
                  onClick={handleForceFullPush}
                  disabled={loading}
                  className="settings-action-button"
                >
                  强制全量 Push ⚠️
                </IonButton>
                <p className="settings-button-hint">重新上传所有本地数据到云端</p>
                <IonButton
                  expand="block"
                  fill="outline"
                  color="warning"
                  onClick={handleForceFullPull}
                  disabled={loading}
                  className="settings-action-button"
                >
                  强制全量 Pull ⚠️
                </IonButton>
                <p className="settings-button-hint">拉取并合并所有远程数据</p>
              </div>

              <div className="settings-subsection">
                <h4 className="settings-subsection-title">高级维护</h4>
                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handleResetSyncState}
                  disabled={loading}
                  className="settings-action-button"
                >
                  🔄 重置同步状态
                </IonButton>
                <p className="settings-button-hint">清空时间戳，下次 Pull 会重新拉取所有文件</p>
                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handleCleanupLogs}
                  disabled={loading}
                  className="settings-action-button"
                >
                  🗑️ 清理操作日志
                </IonButton>
                <p className="settings-button-hint">删除 7 天前的已同步操作日志</p>
                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={handlePurgeDeletedRecords}
                  disabled={loading}
                  className="settings-action-button"
                >
                  🗑️ 清理已删除数据
                </IonButton>
                <p className="settings-button-hint">物理删除 30 天前已软删除的记录</p>
              </div>

              {lastResult && renderLastResult()}
            </div>
          </IonAccordion>
        </IonAccordionGroup>
      </div>
    </div>
  );
};
