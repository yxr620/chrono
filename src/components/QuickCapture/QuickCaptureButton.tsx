import React, { useState } from 'react';
import { IonButton, IonIcon, IonAlert } from '@ionic/react';
import { micOutline } from 'ionicons/icons';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { useAIStore } from '../../stores/aiStore';
import { useAuthStore } from '../../stores/authStore';
import { navigateToTab } from '../../services/appNavigation';
import { QuickCaptureSheet } from './QuickCaptureSheet';
import './QuickCaptureButton.css';

export const QuickCaptureButton: React.FC = () => {
  const aiMode = useFeatureModeStore(s => s.modes.ai);
  const isConfigured = useAIStore(s => s.isConfigured);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const aiReady =
    aiMode === 'managed' ? isAuthenticated : aiMode === 'byo' && isConfigured();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const handleClick = () => {
    if (aiReady) {
      setSheetOpen(true);
    } else {
      setAlertOpen(true);
    }
  };

  return (
    <>
      <IonButton
        className="quick-capture-btn"
        onClick={handleClick}
        aria-label="快速补录"
      >
        <IonIcon icon={micOutline} />
      </IonButton>

      <QuickCaptureSheet isOpen={sheetOpen} onDismiss={() => setSheetOpen(false)} />

      <IonAlert
        isOpen={alertOpen}
        header="快速补录需要 AI 协助"
        message="开通 AI（推荐 Managed 模式，登录即可使用）后，可以用一句话补录最近几小时的活动。"
        buttons={[
          { text: '以后再说', role: 'cancel', handler: () => setAlertOpen(false) },
          {
            text: '去开通',
            handler: () => {
              setAlertOpen(false);
              navigateToTab('export');
            },
          },
        ]}
        onDidDismiss={() => setAlertOpen(false)}
      />
    </>
  );
};
