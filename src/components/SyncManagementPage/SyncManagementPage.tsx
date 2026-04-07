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
    // 如果未配置，自动显示配置表单
    if (!configured) setShowOSSForm(true);
    // 加载已保存的配置到表单，优先手动配置，降级到 env 配置
    const saved = getSavedOSSConfig();
    if (saved) {
      setOSSForm(saved);
      setConfigSource('manual');
    } else {
      // 没有手动配置时，从 env 读取有效配置显示
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
    presentToast({
      message,
      duration: 2000,
      position: 'top',
      color
    });
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

  const handleIncrementalSync = () => {
    handleSync(() => syncEngine.incrementalSync(), '增量同步', 'both');
  };

  const handleIncrementalPush = () => {
    handleSync(() => syncEngine.incrementalPush(), '增量 Push', 'push');
  };

  const handleIncrementalPull = () => {
    handleSync(() => syncEngine.incrementalPull(), '增量 Pull', 'pull');
  };

  const handleForceFullSync = () => {
    presentAlert({
      header: '强制全量同步',
      message: '这将重新上传所有本地数据，并拉取所有远程数据。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: () => {
            handleSync(() => syncEngine.forceFullSync(), '强制全量同步');
          }
        }
      ]
    });
  };

  const handleForceFullPush = () => {
    presentAlert({
      header: '强制全量 Push',
      message: '⚠️ 这将重新上传所有本地数据到云端。适用于 OSS 被清空的恢复场景。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: () => {
            handleSync(() => syncEngine.forceFullPush(), '强制全量 Push');
          }
        }
      ]
    });
  };

  const handleForceFullPull = () => {
    presentAlert({
      header: '强制全量 Pull',
      message: '⚠️ 这将拉取并合并所有远程数据。可能会覆盖本地未同步的修改。确定继续？',
      buttons: [
        { text: '取消', role: 'cancel' },
        {
          text: '确定',
          handler: () => {
            handleSync(() => syncEngine.forceFullPull(), '强制全量 Pull');
          }
        }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 自动同步设置 */}
      {isConfigured && !showOSSForm && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}>
          <div>
            <div style={{ fontSize: '15px', color: 'hsl(var(--foreground))', fontWeight: '500' }}>自动同步</div>
            <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginTop: '4px' }}>数据变更自动推送，启动时自动拉取</div>
          </div>
          <IonToggle checked={autoSyncEnabled} onIonChange={(e) => setAutoSyncEnabled(e.detail.checked)} />
        </div>
      )}

      {/* OSS 配置区域 */}
      {(!isConfigured || showOSSForm) && (
        <div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px', color: 'hsl(var(--foreground))' }}>
            {isConfigured ? '修改 OSS 配置' : 'OSS 配置'}
          </div>
          {configSource === 'env' && (
            <div style={{
              fontSize: '12px', color: 'hsl(210 80% 55%)', marginBottom: '8px', lineHeight: '1.3',
              padding: '6px 10px', backgroundColor: 'hsl(210 80% 55% / 0.1)',
              borderRadius: '6px', border: '1px solid hsl(210 80% 55% / 0.2)',
            }}>
              📋 当前使用 .env 环境变量配置，修改后将保存为应用内配置
            </div>
          )}
          {configSource === 'manual' && isConfigured && (
            <div style={{
              fontSize: '12px', color: 'hsl(142 76% 36%)', marginBottom: '8px', lineHeight: '1.3',
              padding: '6px 10px', backgroundColor: 'hsl(142 76% 36% / 0.1)',
              borderRadius: '6px', border: '1px solid hsl(142 76% 36% / 0.2)',
            }}>
              ✅ 当前使用应用内手动配置
            </div>
          )}
          {!isConfigured && configSource === 'none' && (
            <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px', lineHeight: '1.3' }}>
              请输入阿里云 OSS 配置信息以启用同步功能
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '3px' }}>Region</label>
              <input
                type="text"
                value={ossForm.region}
                onChange={(e) => setOSSForm(f => ({ ...f, region: e.target.value }))}
                placeholder="oss-cn-hangzhou"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '13px',
                  borderRadius: '8px', border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '3px' }}>Bucket</label>
              <input
                type="text"
                value={ossForm.bucket}
                onChange={(e) => setOSSForm(f => ({ ...f, bucket: e.target.value }))}
                placeholder="your-bucket-name"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '13px',
                  borderRadius: '8px', border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '3px' }}>AccessKey ID</label>
              <input
                type="password"
                value={ossForm.accessKeyId}
                onChange={(e) => setOSSForm(f => ({ ...f, accessKeyId: e.target.value }))}
                placeholder="your-access-key-id"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '13px',
                  borderRadius: '8px', border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: '3px' }}>AccessKey Secret</label>
              <input
                type="password"
                value={ossForm.accessKeySecret}
                onChange={(e) => setOSSForm(f => ({ ...f, accessKeySecret: e.target.value }))}
                placeholder="your-access-key-secret"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: '13px',
                  borderRadius: '8px', border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <IonButton
                expand="block"
                onClick={() => {
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
                }}
                style={{ '--border-radius': '10px', height: '42px', margin: '0', flex: 1 }}
              >
                💾 保存配置
              </IonButton>
              {isConfigured && (
                <IonButton
                  fill="outline"
                  onClick={() => setShowOSSForm(false)}
                  style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
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
                onClick={() => {
                  presentAlert({
                    header: '清除 OSS 配置',
                    message: '清除后将回退到 .env 环境变量配置。如果 .env 中没有配置，同步功能将被禁用。确定继续？',
                    buttons: [
                      { text: '取消', role: 'cancel' },
                      {
                        text: '确定清除',
                        handler: () => {
                          removeOSSConfig();
                          // 清除后，重新从 env 加载配置显示
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
                }}
                style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
              >
                🗑️ 清除应用内配置
              </IonButton>
            )}
          </div>
        </div>
      )}

      {isConfigured && !showOSSForm && (
        <>
          {/* 增量同步 */}
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px', color: 'hsl(var(--foreground))' }}>
              增量同步（推荐）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <IonButton
                expand="block"
                onClick={handleIncrementalSync}
                disabled={loading}
                style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
              >
                {loading ? <IonSpinner name="dots" /> : '🔄 增量同步 (Push + Pull)'}
              </IonButton>
              <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px', marginBottom: '2px' }}>
                同步本地和云端的增量数据
              </div>
              <IonButton
                expand="block"
                fill="outline"
                onClick={handleIncrementalPush}
                disabled={loading}
                style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
              >
                ⬆️ 增量 Push
              </IonButton>
              <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px', marginBottom: '2px' }}>
                上传本地未同步的数据到云端
              </div>
              <IonButton
                expand="block"
                fill="outline"
                onClick={handleIncrementalPull}
                disabled={loading}
                style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
              >
                ⬇️ 增量 Pull
              </IonButton>
              <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px' }}>
                下载云端的增量数据到本地
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}></div>

          {/* 同步状态 */}
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px', color: 'hsl(var(--foreground))' }}>
              同步状态
            </div>
            {stats ? (
              <div className="sync-stats" style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', lineHeight: '1.4' }}>
                <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className="stat-label" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>OSS 配置:</span>
                  <span
                    className="stat-value"
                    style={{ fontWeight: '500', color: 'hsl(210 80% 55%)', cursor: 'pointer' }}
                    onClick={() => setShowOSSForm(true)}
                  >✅ 已配置（点击修改）</span>
                </div>
                <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className="stat-label" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>设备 ID:</span>
                  <span className="stat-value" style={{ fontWeight: '500', fontFamily: 'monospace', fontSize: '12px', color: 'hsl(var(--foreground))' }}>{stats.deviceId.substring(0, 8)}...</span>
                </div>
                <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className="stat-label" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>未同步操作:</span>
                  <span className="stat-value" style={{ fontWeight: '500', color: stats.pendingOps > 0 ? 'hsl(var(--destructive))' : 'hsl(34 89% 52%)' }}>{stats.pendingOps} 条</span>
                </div>
                <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className="stat-label" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>已同步操作:</span>
                  <span className="stat-value" style={{ fontWeight: '500', color: 'hsl(var(--foreground))' }}>{stats.syncedOps} 条</span>
                </div>
                <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className="stat-label" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>数据记录:</span>
                  <span className="stat-value" style={{ fontWeight: '500', color: 'hsl(var(--foreground))' }}>
                    {stats.totalEntries} 条目 / {stats.totalGoals} 目标 / {stats.totalCategories} 分类
                  </span>
                </div>
                <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span className="stat-label" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>已删除记录:</span>
                  <span className="stat-value" style={{ fontWeight: '500', color: (stats.deletedEntries + stats.deletedGoals + stats.deletedCategories) > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))' }}>
                    {stats.deletedEntries + stats.deletedGoals + stats.deletedCategories} 条
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px' }}>
                <IonSpinner />
              </div>
            )}
          </div>

          {/* 高级与危险操作 (折叠面板) */}
          <div style={{ marginTop: '16px' }}>
            <IonAccordionGroup>
              <IonAccordion value="advanced" style={{ background: 'transparent' }}>
                <IonItem slot="header" style={{ '--border-radius': '8px', '--padding-start': '0', '--background': 'transparent' }}>
                  <IonLabel style={{ fontWeight: 'bold', color: 'hsl(var(--foreground))' }}>高级与数据恢复操作</IonLabel>
                </IonItem>
                <div className="ion-padding" slot="content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>

                  {/* 强制全量同步 */}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px', color: 'hsl(var(--foreground))' }}>
                      强制全量同步（数据恢复）
                    </div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px', lineHeight: '1.3' }}>
                      ⚠️ 适用于数据恢复或重建同步状态的场景
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <IonButton
                        expand="block"
                        color="warning"
                        onClick={handleForceFullSync}
                        disabled={loading}
                        style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
                      >
                        ⚠️ 强制全量同步 (Push + Pull)
                      </IonButton>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px', marginBottom: '2px' }}>
                        重新上传并拉取所有数据
                      </div>
                      <IonButton
                        expand="block"
                        fill="outline"
                        color="warning"
                        onClick={handleForceFullPush}
                        disabled={loading}
                        style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
                      >
                        强制全量 Push ⚠️
                      </IonButton>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px', marginBottom: '2px' }}>
                        重新上传所有本地数据到云端
                      </div>
                      <IonButton
                        expand="block"
                        fill="outline"
                        color="warning"
                        onClick={handleForceFullPull}
                        disabled={loading}
                        style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
                      >
                        强制全量 Pull ⚠️
                      </IonButton>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px' }}>
                        拉取并合并所有远程数据
                      </div>
                    </div>
                  </div>

                  {/* 高级操作 */}
                  <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '6px', color: 'hsl(var(--foreground))' }}>
                      高级维护
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <IonButton
                        expand="block"
                        fill="outline"
                        onClick={handleResetSyncState}
                        disabled={loading}
                        style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
                      >
                        🔄 重置同步状态
                      </IonButton>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px', marginBottom: '2px' }}>
                        清空时间戳，下次 Pull 会重新拉取所有文件
                      </div>
                      <IonButton
                        expand="block"
                        fill="outline"
                        onClick={handleCleanupLogs}
                        disabled={loading}
                        style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
                      >
                        🗑️ 清理操作日志
                      </IonButton>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px', marginBottom: '2px' }}>
                        删除 7 天前的已同步操作日志
                      </div>
                      <IonButton
                        expand="block"
                        fill="outline"
                        onClick={handlePurgeDeletedRecords}
                        disabled={loading}
                        style={{ '--border-radius': '10px', height: '42px', margin: '0' }}
                      >
                        🗑️ 清理已删除数据
                      </IonButton>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', paddingLeft: '6px' }}>
                        物理删除 30 天前已软删除的记录
                      </div>
                    </div>
                  </div>
                </div>
              </IonAccordion>
            </IonAccordionGroup>
          </div>

          {/* 同步结果 */}
          {lastResult && (
            <div style={{ marginTop: '8px', borderTop: '1px solid hsl(var(--border))', paddingTop: '10px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px', color: 'hsl(var(--foreground))' }}>
                最近同步结果
              </div>
              <div className="sync-result" style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', lineHeight: '1.4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>状态:</span>
                  <span style={{
                    fontWeight: '500',
                    color: lastResult.status === 'success' ? 'hsl(142 76% 36%)' : 'hsl(var(--destructive))'
                  }}>
                    {lastResult.status === 'success' ? '✅ 成功' : '❌ 失败'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>消息:</span>
                  <span style={{ fontWeight: '500', fontSize: '13px', color: 'hsl(var(--foreground))' }}>{lastResult.message}</span>
                </div>
                {lastResult.pushedCount !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>上传:</span>
                    <span style={{ fontWeight: '500', color: 'hsl(var(--foreground))' }}>↑ {lastResult.pushedCount} 条</span>
                  </div>
                )}
                {lastResult.pulledCount !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>下载:</span>
                    <span style={{ fontWeight: '500', color: 'hsl(var(--foreground))' }}>↓ {lastResult.pulledCount} 条</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
