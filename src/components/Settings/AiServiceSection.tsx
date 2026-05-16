import React, { useState } from 'react';
import { IonItem, IonLabel, IonRadio, IonRadioGroup, IonIcon } from '@ionic/react';
import { chevronDownOutline, sparklesOutline } from 'ionicons/icons';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import type { FeatureMode } from '../../services/gateway/types';
import { AiProviderForm } from './AiProviderForm';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';
import { useManagedAiModel } from '../../hooks/useManagedAiModel';
import { formatManagedAiModel } from '../../services/ai/managedAiModelLabel';

const AI_OPTIONS: Array<{ mode: FeatureMode; label: string; hint: string }> = [
  { mode: 'disabled', label: '关闭',                       hint: '不启用 AI 助手' },
  { mode: 'byo',      label: '使用我的 LLM Key（BYO）',    hint: '沿用你自己的服务商与凭据' },
  { mode: 'managed',  label: '使用 Chrono 托管 AI',         hint: '需要登录 Chrono 账号' },
];

interface Props {
  onRequestSignIn: () => void;
}

export const AiServiceSection: React.FC<Props> = ({ onRequestSignIn }) => {
  const mode = useFeatureModeStore((s) => s.modes.ai);
  const setMode = useFeatureModeStore((s) => s.setMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [expanded, setExpanded] = useState(false);

  const managedAvailable = !!import.meta.env.VITE_AUTH_API_URL;
  const managedAiModel = useManagedAiModel(managedAvailable && (expanded || mode === 'managed'));
  const managedAiModelLabel = formatManagedAiModel(managedAiModel);
  const currentOption = AI_OPTIONS.find((opt) => opt.mode === mode) || AI_OPTIONS[0];
  const currentSubtitle = mode === 'managed'
    ? `${currentOption.label} · ${managedAiModelLabel}`
    : currentOption.label;

  const switchToManagedIfAllowed = async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      onRequestSignIn();
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
        onRequestSignIn();
        return;
      }
      void switchToManagedIfAllowed();
      return;
    }
    setMode('ai', next);
  };

  return (
    <section className={`service-section service-section--collapsible${expanded ? ' service-section--expanded' : ''}`}>
      <button
        type="button"
        className="service-section__summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="ai-service-settings"
      >
        <span className="service-section__heading">
          <IonIcon icon={sparklesOutline} className="service-section__icon" />
          <span className="service-section__title-block">
            <span className="service-section__title">AI 助手</span>
            <span className="service-section__subtitle">{currentSubtitle}</span>
          </span>
        </span>
        <IonIcon icon={chevronDownOutline} className="service-section__chevron" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="service-section__content" id="ai-service-settings">
          <IonRadioGroup
            value={mode}
            onIonChange={(event) => handleSelect(event.detail.value as FeatureMode)}
            className="service-section__radios"
            aria-label="AI 模式"
          >
            {AI_OPTIONS.filter((opt) => {
              if (opt.mode !== 'managed') return true;
              return managedAvailable && isAuthenticated;
            }).map((opt) => (
              <IonItem key={opt.mode} lines="none">
                <IonRadio slot="start" value={opt.mode} />
                <IonLabel>
                  <h3>{opt.label}</h3>
                  <p>{opt.mode === 'managed' ? `当前模型：${managedAiModelLabel}` : opt.hint}</p>
                </IonLabel>
              </IonItem>
            ))}
          </IonRadioGroup>

          {mode === 'byo' && (
            <div className="service-section__byo-form">
              <AiProviderForm />
            </div>
          )}
        </div>
      )}
    </section>
  );
};
