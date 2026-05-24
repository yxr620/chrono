import React from 'react';
import { useIonAlert } from '@ionic/react';
import type { DeviceRecord, StorageInfo } from '../../services/userDataService';
import { formatRelativeTime } from '../../utils/formatTime';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export interface DeviceListViewProps {
  devices: DeviceRecord[] | null;   // null = loading
  storage: StorageInfo | null;
  currentDeviceId: string;
  busy: boolean;
  error: string | null;
  onRemove: (deviceId: string) => void;
  onRetry: () => void;
}

export const DeviceListView: React.FC<DeviceListViewProps> = ({
  devices,
  storage,
  currentDeviceId,
  busy,
  error,
  onRemove,
  onRetry,
}) => {
  const [presentAlert] = useIonAlert();

  const confirmRemove = (deviceId: string) => {
    const isSelf = deviceId === currentDeviceId;
    presentAlert({
      header: isSelf ? '移除本机的远程数据' : '移除设备数据',
      message: `将从 OSS 删除 ${deviceId} 的快照和 oplog；该设备本地数据不受影响。下次该设备触发 Push 会重新写入。`,
      buttons: [
        { text: '取消', role: 'cancel' },
        { text: '移除', role: 'destructive', handler: () => onRemove(deviceId) },
      ],
    });
  };

  return (
    <div className="my-data">
      <h4 className="settings-subsection-title">设备列表</h4>
      {error && (
        <div>
          <p className="my-data__error">{error}</p>
          <button
            type="button"
            className="my-data__refresh-btn"
            onClick={onRetry}
            disabled={busy}
          >
            重试
          </button>
        </div>
      )}
      {!error && !devices && <p>加载中...</p>}
      {!error && devices && devices.length === 0 && (
        <p className="my-data__empty">暂无同步数据。完成首次同步后会在此显示。</p>
      )}
      {!error && devices && devices.map((d) => {
        const isSelf = d.deviceId === currentDeviceId;
        return (
          <div key={d.deviceId} className={`my-data__row ${d.stale ? 'is-stale' : ''}`}>
            <div>
              <strong>{d.deviceId}</strong>
              {isSelf && <span className="my-data__self-badge">本机</span>}
              {d.stale && <span className="my-data__stale-badge">已超过 90 天未同步</span>}
              <div className="my-data__row-meta">
                快照 {fmtBytes(d.snapshotBytes)} · oplog {d.oplogCount} 个 ({fmtBytes(d.oplogBytes)}) · 最后推送 {formatRelativeTime(new Date(d.lastSeenAt).getTime())}
              </div>
            </div>
            <button
              type="button"
              className="my-data__danger-btn"
              disabled={busy}
              onClick={() => confirmRemove(d.deviceId)}
            >
              {isSelf ? '移除并退出同步' : '移除'}
            </button>
          </div>
        );
      })}

      <h4 className="settings-subsection-title" style={{ marginTop: 16 }}>存储用量</h4>
      {storage ? (
        <div>
          <div>总计：{fmtBytes(storage.totalBytes)}</div>
          {storage.breakdown.map((b) => (
            <div key={b.namespace}>· {b.namespace}: {fmtBytes(b.bytes)}</div>
          ))}
        </div>
      ) : !error ? <p>加载中...</p> : null}

      <div className="my-data__actions">
        <button
          type="button"
          className="my-data__refresh-btn"
          onClick={onRetry}
          disabled={busy}
        >
          刷新
        </button>
      </div>
    </div>
  );
};
