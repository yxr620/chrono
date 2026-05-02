import React from 'react';
import { IonRadioGroup, IonRadio, IonItem, IonLabel } from '@ionic/react';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import type { FeatureMode } from '../../services/gateway/types';

// TODO Task 3: replace with <OssCredentialsForm />
const OssCredentialsFormStub: React.FC = () => (
  <p className="service-section__placeholder">OSS 凭据表单占位（Task 3 实装）</p>
);

const SYNC_OPTIONS: Array<{ mode: FeatureMode; label: string; hint: string; disabled?: boolean }> = [
  { mode: 'disabled', label: '关闭',                   hint: '不进行多设备同步' },
  { mode: 'byo',      label: '使用我的 OSS 凭据（BYO）', hint: '保留现有手动配置' },
  { mode: 'managed',  label: '使用 Chrono 托管同步',     hint: '需要登录（即将推出）', disabled: true },
];

export const SyncServiceSection: React.FC = () => {
  const mode = useFeatureModeStore((s) => s.modes.sync);
  const setMode = useFeatureModeStore((s) => s.setMode);

  return (
    <section className="service-section">
      <header className="service-section__header">
        <span className="service-section__icon">☁️</span>
        <span className="service-section__title">多设备同步</span>
      </header>

      <IonRadioGroup
        value={mode}
        onIonChange={(e) => setMode('sync', e.detail.value as FeatureMode)}
        className="service-section__radios"
      >
        {SYNC_OPTIONS.map((opt) => (
          <IonItem key={opt.mode} lines="none">
            <IonRadio slot="start" value={opt.mode} disabled={opt.disabled} />
            <IonLabel>
              <h3>{opt.label}</h3>
              <p>{opt.hint}</p>
            </IonLabel>
          </IonItem>
        ))}
      </IonRadioGroup>

      {mode === 'byo' && (
        <div className="service-section__byo-form">
          <OssCredentialsFormStub />
        </div>
      )}
    </section>
  );
};
