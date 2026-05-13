import React, { useEffect, useState } from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import { useAuthStore } from '../../stores/authStore';
import { userDataService } from '../../services/userDataService';
import type { DeviceRecord, StorageInfo } from '../../services/userDataService';
import './MyDataSection.css';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const MyDataContent: React.FC = () => {
  const auth = useAuthStore();
  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const [d, s] = await Promise.all([
        userDataService.listDevices(),
        userDataService.getStorage(),
      ]);
      setDevices(d.devices);
      setStorage(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  };

  useEffect(() => {
    if (auth.isAuthenticated) load();
  }, [auth.isAuthenticated]);

  const handleRemove = async (id: string) => {
    if (!confirm(`确认删除设备 ${id} 的所有数据？此操作不可撤销。`)) return;
    setBusy(true);
    try {
      await userDataService.removeDevice(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'remove_failed');
    } finally {
      setBusy(false);
    }
  };

  if (!auth.isAuthenticated) return null;

  return (
    <div className="my-data">
      <h4 className="settings-subsection-title">设备列表</h4>
      {error && <p className="my-data__error">{error}</p>}
      {!devices && <p>加载中...</p>}
      {devices && devices.length === 0 && <p>暂无同步数据</p>}
      {devices && devices.map(d => (
        <div key={d.deviceId} className={`my-data__row ${d.stale ? 'is-stale' : ''}`}>
          <div>
            <strong>{d.deviceId}</strong>
            {d.stale && <span className="my-data__stale-badge">已超过 90 天未同步</span>}
            <div className="my-data__row-meta">
              快照 {fmtBytes(d.snapshotBytes)} · oplog {d.oplogCount} 个 ({fmtBytes(d.oplogBytes)}) · 最后 {new Date(d.lastSeenAt).toLocaleString()}
            </div>
          </div>
          <button disabled={busy} onClick={() => handleRemove(d.deviceId)}>移除</button>
        </div>
      ))}

      <h4 className="settings-subsection-title" style={{ marginTop: 16 }}>存储用量</h4>
      {storage && (
        <div>
          <div>总计：{fmtBytes(storage.totalBytes)}</div>
          {storage.breakdown.map(b => (
            <div key={b.namespace}>· {b.namespace}: {fmtBytes(b.bytes)}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export const MyDataSection: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  return (
    <IonCard className="settings-card">
      <IonCardContent className="settings-card-content">
        <MyDataContent />
      </IonCardContent>
    </IonCard>
  );
};
