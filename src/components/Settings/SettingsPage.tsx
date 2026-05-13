import React from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import { useDarkMode } from '../../hooks/useDarkMode';
import { SyncManagementPage } from '../SyncManagementPage/SyncManagementPage';
import { AccountSection } from './AccountSection';
import { SyncServiceSection } from './SyncServiceSection';
import { AiServiceSection } from './AiServiceSection';
import { GeneralSection } from './GeneralSection';
import { BackupSection } from './BackupSection';
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

      {/* 5. 通用 */}
      <GeneralSection />

      {/* 6. 数据备份 */}
      <BackupSection />
    </div>
  );
};
