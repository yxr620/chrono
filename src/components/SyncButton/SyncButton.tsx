/**
 * SyncButton Component
 * 同步按钮，显示同步状态和触发同步
 */

import { useEffect } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { useSyncStore } from '../../stores/syncStore';
import { useAppToast } from '../../hooks/useAppToast';
import { cloudUploadOutline, checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons';
import { emitSyncStatus } from '../../services/syncToast';

export const SyncButton: React.FC = () => {
  const { status, message, lastSyncTime, pushedCount, pulledCount, isConfigured, sync } = useSyncStore();
  const [present] = useAppToast();

  useEffect(() => {
    if (status === 'success' && message) {
      // Show via header indicator instead of toast
      emitSyncStatus({
        phase: 'done',
        direction: 'both',
        pushedCount,
        pulledCount,
      });
    } else if (status === 'error' && message) {
      emitSyncStatus({ phase: 'error', direction: 'both' });
      present({
        message: '同步失败，详情请查看设置页',
        duration: 3000,
        position: 'top',
        color: 'danger',
        icon: closeCircleOutline
      });
    }
  }, [status, message, pushedCount, pulledCount, present]);

  const handleSync = async () => {
    if (status === 'syncing') return;
    emitSyncStatus({ phase: 'syncing', direction: 'both' });
    await sync();
  };

  if (!isConfigured) {
    return null; // OSS 未配置时不显示按钮
  }

  const getIcon = () => {
    switch (status) {
      case 'success':
        return checkmarkCircleOutline;
      case 'error':
        return closeCircleOutline;
      default:
        return cloudUploadOutline;
    }
  };

  const getColor = (): 'success' | 'danger' | 'primary' => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      default:
        return 'primary';
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return '未同步';

    const now = Date.now();
    const diff = now - lastSyncTime;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;

    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <IonButton
        color={getColor()}
        fill="outline"
        size="small"
        onClick={handleSync}
        disabled={status === 'syncing'}
        style={{
          '--border-radius': '20px',
          fontSize: '13px',
          fontWeight: '500'
        }}
      >
        {status !== 'syncing' && <IonIcon slot="start" icon={getIcon()} />}
        {status === 'syncing' ? '同步中...' : '同步'}
      </IonButton>

      {lastSyncTime && (
        <div style={{
          fontSize: '11px',
          color: 'hsl(var(--muted-foreground))',
          marginTop: '6px',
          textAlign: 'center'
        }}>
          最后同步: {formatLastSyncTime()}
        </div>
      )}
    </div>
  );
};
