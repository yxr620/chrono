import React, { useState } from 'react';
import { IonRadioGroup, IonRadio, IonItem, IonLabel, IonIcon } from '@ionic/react';
import { chevronDownOutline, cloudOutline } from 'ionicons/icons';
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
  const [expanded, setExpanded] = useState(false);

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
    <section className={`service-section service-section--collapsible${expanded ? ' service-section--expanded' : ''}`}>
      <button
        type="button"
        className="service-section__summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="sync-service-settings"
      >
        <span className="service-section__heading">
          <IonIcon icon={cloudOutline} className="service-section__icon" />
          <span className="service-section__title-block">
            <span className="service-section__title">多设备同步</span>
            <span className="service-section__subtitle">{currentOption.label}</span>
          </span>
        </span>
        <IonIcon icon={chevronDownOutline} className="service-section__chevron" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="service-section__content" id="sync-service-settings">
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
      )}
    </section>
  );
};
