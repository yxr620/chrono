import React from 'react';
import { IonCard, IonCardContent, IonToggle } from '@ionic/react';
import { useDarkMode } from '../../hooks/useDarkMode';

export const GeneralSection: React.FC = () => {
  const { isDark, setDark } = useDarkMode();

  return (
    <IonCard className="settings-card">
      <IonCardContent className="settings-card-content">
        <div className="settings-row">
          <div className="settings-row-label">深色模式</div>
          <IonToggle checked={isDark} onIonChange={(e) => setDark(e.detail.checked)} />
        </div>
      </IonCardContent>
    </IonCard>
  );
};
