import React from 'react';
import { IonItem, IonLabel, IonRadio, IonRadioGroup } from '@ionic/react';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import type { FeatureMode } from '../../services/gateway/types';
import { AiProviderForm } from './AiProviderForm';

const AI_OPTIONS: Array<{ mode: FeatureMode; label: string; hint?: string; disabled?: boolean }> = [
  { mode: 'disabled', label: '关闭', hint: '不启用 AI 助手' },
  { mode: 'byo', label: '使用我的 LLM Key（BYO）', hint: '沿用你自己的服务商与凭据' },
  { mode: 'managed', label: '使用 Chrono 托管 AI', hint: '需要登录（即将推出）', disabled: true },
];

export const AiServiceSection: React.FC = () => {
  const mode = useFeatureModeStore((state) => state.modes.ai);
  const setMode = useFeatureModeStore((state) => state.setMode);

  return (
    <section className="service-section">
      <header className="service-section__header">
        <span className="service-section__icon">🤖</span>
        <span className="service-section__title">AI 助手</span>
      </header>

      <IonRadioGroup
        value={mode}
        onIonChange={(event) => setMode('ai', event.detail.value as FeatureMode)}
        className="service-section__radios"
        aria-label="AI 模式"
      >
        {AI_OPTIONS.map((option) => (
          <IonItem key={option.mode} lines="none">
            <IonRadio slot="start" value={option.mode} disabled={option.disabled} />
            <IonLabel>
              <h3>{option.label}</h3>
              {option.hint && <p>{option.hint}</p>}
            </IonLabel>
          </IonItem>
        ))}
      </IonRadioGroup>

      {mode === 'byo' && (
        <div className="service-section__byo-form">
          <AiProviderForm />
        </div>
      )}
    </section>
  );
};