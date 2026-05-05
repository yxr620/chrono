import React from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import { useDarkMode } from '../../hooks/useDarkMode';
import { SyncManagementPage } from '../SyncManagementPage/SyncManagementPage';
import { AccountSection } from './AccountSection';
import { SyncServiceSection } from './SyncServiceSection';
import { AiServiceSection } from './AiServiceSection';
import { MyDataSection } from './MyDataSection';
import { GeneralSection } from './GeneralSection';
import { BackupSection } from './BackupSection';
import { DangerZone } from './DangerZone';
import './SettingsPage.css';

export const SettingsPage: React.FC = () => {
  const { isDark } = useDarkMode();

  const handleRequestSignIn = () => {
    const el = document.getElementById('settings-account');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={`settings-page${isDark ? ' settings-page-dark' : ''}`}>
      {/* 1. 同步操作 — high-frequency, top */}
      <IonCard className="settings-card">
        <IonCardContent className="settings-card-content">
          <h3 className="settings-card-title">云端同步</h3>
          <SyncManagementPage />
        </IonCardContent>
      </IonCard>

      {/* 2. 账号 — sole sign-in entry */}
      <AccountSection />

      {/* 3. 多设备同步配置 */}
      <IonCard className="settings-card">
        <IonCardContent className="settings-card-content">
          <SyncServiceSection onRequestSignIn={handleRequestSignIn} />
        </IonCardContent>
      </IonCard>

      {/* 4. AI 助手配置 */}
      <IonCard className="settings-card">
        <IonCardContent className="settings-card-content">
          <AiServiceSection onRequestSignIn={handleRequestSignIn} />
        </IonCardContent>
      </IonCard>

      {/* 5. 我的数据 (only when authenticated) */}
      <MyDataSection />

      {/* 6. 通用 */}
      <GeneralSection />

      {/* 7. 数据备份 */}
      <BackupSection />

      {/* 8. 危险区 (only when authenticated) */}
      <DangerZone />
    </div>
  );
};
