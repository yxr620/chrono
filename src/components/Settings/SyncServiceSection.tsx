import React from 'react';
import {
  IonAccordion,
  IonAccordionGroup,
  IonIcon,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
} from '@ionic/react';
import { cloudOutline } from 'ionicons/icons';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import type { FeatureMode } from '../../services/gateway/types';
import { OssCredentialsForm } from './OssCredentialsForm';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';

const SYNC_OPTIONS: Array<{ mode: FeatureMode; label: string; hint: string }> = [
  { mode: 'disabled', label: '关闭',                   hint: '不进行多设备同步' },
  { mode: 'byo',      label: '使用我的 OSS 凭据（BYO）', hint: '保留现有手动配置' },
  { mode: 'managed',  label: '使用 Chrono 托管同步',     hint: '需要登录 Chrono 账号' },
];

interface Props {
  onRequestSignIn: () => void;
}

export const SyncServiceSection: React.FC<Props> = ({ onRequestSignIn }) => {
  const mode = useFeatureModeStore((s) => s.modes.sync);
  const setMode = useFeatureModeStore((s) => s.setMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const managedAvailable = !!import.meta.env.VITE_AUTH_API_URL;
  const currentOption = SYNC_OPTIONS.find((opt) => opt.mode === mode) || SYNC_OPTIONS[0];

  const switchToManagedIfAllowed = async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      onRequestSignIn();
      return;
    }
    try {
      const flags = await authService.getFeatureFlags(token);
      if (!flags.sync) {
        alert('您的账号未在 sync 白名单中。请联系管理员。');
        return;
      }
      setMode('sync', 'managed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      alert('验证 sync 权限失败：' + message);
    }
  };

  const handleSelect = (next: FeatureMode) => {
    if (next === 'managed') {
      if (!isAuthenticated) {
        onRequestSignIn();
        return;
      }
      void switchToManagedIfAllowed();
      return;
    }
    setMode('sync', next);
  };

  return (
    <div className="settings-accordion-wrap service-section-accordion">
      <IonAccordionGroup>
        <IonAccordion value="sync-service">
          <IonItem slot="header" lines="none">
            <IonIcon icon={cloudOutline} slot="start" aria-hidden="true" />
            <IonLabel>
              <h3>多设备同步</h3>
              <p>{currentOption.label}</p>
            </IonLabel>
          </IonItem>

          <div className="settings-accordion-content" slot="content">
            <IonRadioGroup
              value={mode}
              onIonChange={(e) => handleSelect(e.detail.value as FeatureMode)}
              className="service-section__radios"
              aria-label="同步模式"
            >
              {SYNC_OPTIONS.filter((opt) => {
                if (opt.mode !== 'managed') return true;
                return managedAvailable && isAuthenticated;
              }).map((opt) => (
                <IonItem key={opt.mode} lines="none">
                  <IonRadio slot="start" value={opt.mode} />
                  <IonLabel>
                    <h3>{opt.label}</h3>
                    <p>{opt.hint}</p>
                  </IonLabel>
                </IonItem>
              ))}
            </IonRadioGroup>

            {mode === 'byo' && (
              <div className="service-section__byo-form">
                <OssCredentialsForm />
              </div>
            )}
          </div>
        </IonAccordion>
      </IonAccordionGroup>
    </div>
  );
};
