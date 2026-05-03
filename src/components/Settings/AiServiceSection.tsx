import React, { useState } from 'react';
import { IonItem, IonLabel, IonRadio, IonRadioGroup } from '@ionic/react';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import type { FeatureMode } from '../../services/gateway/types';
import { AiProviderForm } from './AiProviderForm';
import { SignInPage } from '../Auth/SignInPage';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';

const AI_OPTIONS: Array<{ mode: FeatureMode; label: string; hint: string }> = [
  { mode: 'disabled', label: '关闭',                       hint: '不启用 AI 助手' },
  { mode: 'byo',      label: '使用我的 LLM Key（BYO）',    hint: '沿用你自己的服务商与凭据' },
  { mode: 'managed',  label: '使用 Chrono 托管 AI',         hint: '需要登录 Chrono 账号' },
];

export const AiServiceSection: React.FC = () => {
  const mode = useFeatureModeStore((s) => s.modes.ai);
  const setMode = useFeatureModeStore((s) => s.setMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [showSignIn, setShowSignIn] = useState(false);

  const managedAvailable = !!import.meta.env.VITE_AUTH_API_URL;

  const switchToManagedIfAllowed = async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      setShowSignIn(true);
      return;
    }
    try {
      const flags = await authService.getFeatureFlags(token);
      if (!flags.ai) {
        alert('您的账号未在 AI 白名单中。请联系管理员。');
        return;
      }
      setMode('ai', 'managed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      alert('验证 AI 权限失败：' + message);
    }
  };

  const handleSelect = (next: FeatureMode) => {
    if (next === 'managed') {
      if (!isAuthenticated) {
        setShowSignIn(true);
        return;
      }
      void switchToManagedIfAllowed();
      return;
    }
    setMode('ai', next);
  };

  return (
    <section className="service-section">
      <header className="service-section__header">
        <span className="service-section__icon">🤖</span>
        <span className="service-section__title">AI 助手</span>
      </header>

      <IonRadioGroup
        value={mode}
        onIonChange={(event) => handleSelect(event.detail.value as FeatureMode)}
        className="service-section__radios"
        aria-label="AI 模式"
      >
        {AI_OPTIONS.map((opt) => {
          const disabled = opt.mode === 'managed' && !managedAvailable;
          return (
            <IonItem key={opt.mode} lines="none">
              <IonRadio slot="start" value={opt.mode} disabled={disabled} />
              <IonLabel>
                <h3>{opt.label}</h3>
                <p>{opt.hint}</p>
              </IonLabel>
            </IonItem>
          );
        })}
      </IonRadioGroup>

      {mode === 'byo' && (
        <div className="service-section__byo-form">
          <AiProviderForm />
        </div>
      )}

      {showSignIn && (
        <SignInPage
          onClose={() => setShowSignIn(false)}
          onSuccess={() => {
            void switchToManagedIfAllowed();
          }}
        />
      )}
    </section>
  );
};
