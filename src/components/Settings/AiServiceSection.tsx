import React, { useState } from 'react';
import {
  IonAccordion,
  IonAccordionGroup,
  IonIcon,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
} from '@ionic/react';
import { sparklesOutline } from 'ionicons/icons';
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

const AI_ACCORDION_VALUE = 'ai-service';

interface Props {
  onRequestSignIn: () => void;
}

export const AiServiceSection: React.FC<Props> = ({ onRequestSignIn }) => {
  const mode = useFeatureModeStore((s) => s.modes.ai);
  const setMode = useFeatureModeStore((s) => s.setMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [expandedValue, setExpandedValue] = useState<string | undefined>(undefined);
  const expanded = expandedValue === AI_ACCORDION_VALUE;

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
    <div className="settings-accordion-wrap service-section-accordion">
      <IonAccordionGroup
        value={expandedValue}
        onIonChange={(event) => {
          const next = event.detail.value;
          setExpandedValue(typeof next === 'string' ? next : undefined);
        }}
      >
        <IonAccordion value={AI_ACCORDION_VALUE}>
          <IonItem slot="header" lines="none">
            <IonIcon icon={sparklesOutline} slot="start" aria-hidden="true" />
            <IonLabel>
              <h3>AI 助手</h3>
              <p>{currentSubtitle}</p>
            </IonLabel>
          </IonItem>

          <div className="settings-accordion-content" slot="content">
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
        </IonAccordion>
      </IonAccordionGroup>
    </div>
  );
};
