import React from 'react';
import { IonCard, IonCardContent, IonToggle } from '@ionic/react';
import { useDarkMode } from '../../hooks/useDarkMode';

export const GeneralSection: React.FC = () => {
  const { isDark, setDark } = useDarkMode();

  return (
    <IonCard className="settings-card">
      <IonCardContent className="settings-card-content">
        <h3 className="settings-card-title">通用设置</h3>
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">深色模式</div>
            <div className="settings-row-sub">切换应用主题外观</div>
          </div>
          <IonToggle checked={isDark} onIonChange={(e) => setDark(e.detail.checked)} />
        </div>
      </IonCardContent>
    </IonCard>
  );
};
