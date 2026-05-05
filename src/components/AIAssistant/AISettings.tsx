import React from 'react';
import { IonIcon } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { navigateToTab } from '../../services/appNavigation';
import './AIAssistant.css';

interface AISettingsProps {
  onClose: () => void;
}

export const AISettings: React.FC<AISettingsProps> = ({ onClose }) => {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleOpenServices = () => {
    navigateToTab('export');
    onClose();
  };

  return (
    <div className="ai-settings-overlay" onClick={handleOverlayClick}>
      <div className="ai-settings-modal">
        <div className="ai-settings-header">
          <h2>AI 设置</h2>
          <button className="ai-settings-close" onClick={onClose}>
            <IonIcon icon={closeOutline} />
          </button>
        </div>

        <div className="ai-field">
          <label className="ai-field-label">服务商凭据</label>
          <div className="ai-field-hint">供应商凭据现在统一在「设置」页面配置，这里仅保留偏好说明入口。</div>
        </div>

        <button className="ai-save-btn" onClick={handleOpenServices}>
          打开设置
        </button>
      </div>
    </div>
  );
};
