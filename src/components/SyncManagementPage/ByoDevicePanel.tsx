import React, { useCallback, useEffect, useState } from 'react';
import { byoDeviceService } from '../../services/byoDeviceService';
import type { DeviceRecord, StorageInfo } from '../../services/userDataService';
import { getDeviceId } from '../../services/db';
import { useAppToast } from '../../hooks/useAppToast';
import { DeviceListView } from '../Settings/DeviceListView';
import '../Settings/MyDataSection.css';

export const ByoDevicePanel: React.FC = () => {
  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [presentToast] = useAppToast();

  useEffect(() => {
    void getDeviceId().then(setCurrentDeviceId);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const [d, s] = await Promise.all([
        byoDeviceService.listDevices(),
        byoDeviceService.getStorage(),
      ]);
      setDevices(d.devices);
      setStorage(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await byoDeviceService.removeDevice(id);
      void presentToast({ message: '已移除设备数据', duration: 2000, position: 'top', color: 'success' });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '移除失败';
      void presentToast({ message: msg, duration: 2500, position: 'top', color: 'danger' });
    } finally {
      setBusy(false);
    }
  }, [load, presentToast]);

  return (
    <DeviceListView
      devices={devices}
      storage={storage}
      currentDeviceId={currentDeviceId}
      busy={busy}
      error={error}
      onRemove={handleRemove}
      onRetry={() => void load()}
    />
  );
};
