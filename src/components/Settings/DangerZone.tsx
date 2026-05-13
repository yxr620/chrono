import React, { useState } from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import { useAuthStore } from '../../stores/authStore';
import { userDataService } from '../../services/userDataService';
import './MyDataSection.css';

export const DangerZoneContent: React.FC = () => {
  const auth = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.isAuthenticated) return null;

  const handleDeleteAccount = async () => {
    const email = auth.user?.email ?? '';
    const typed = prompt(`这将删除您的账号和所有数据，无法撤销。\n请输入您的 email 确认：${email}`);
    if (typed !== email) {
      if (typed !== null) alert('email 不匹配，已取消');
      return;
    }
    setBusy(true);
    try {
      await userDataService.deleteAccount(email);
      auth.logout();
      alert('账号已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <p className="my-data__error">{error}</p>}
      <p className="settings-row-sub" style={{ marginBottom: 12 }}>
        下方操作不可撤销，请谨慎使用。
      </p>
      <button className="my-data__danger-btn" disabled={busy} onClick={handleDeleteAccount}>
        删除账号及全部数据
      </button>
    </>
  );
};

export const DangerZone: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  return (
    <IonCard className="settings-card">
      <IonCardContent className="settings-card-content">
        <DangerZoneContent />
      </IonCardContent>
    </IonCard>
  );
};
