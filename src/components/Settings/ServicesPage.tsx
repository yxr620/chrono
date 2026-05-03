import React from 'react';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { useAuthStore } from '../../stores/authStore';
import { AiServiceSection } from './AiServiceSection';
import { SyncServiceSection } from './SyncServiceSection';
import './ServicesPage.css';

export const ServicesPage: React.FC = () => {
  const modes = useFeatureModeStore((s) => s.modes);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="services-page">
      <h2 className="services-page__title">服务</h2>
      <p className="services-page__hint">
        每项功能可独立选择关闭、使用自己的凭据（BYO）或由 Chrono 后端代理。
      </p>

      {isAuthenticated && (
        <div className="services-page__account">
          <span>已登录：{user?.email}</span>
          <button type="button" onClick={() => logout()}>退出</button>
        </div>
      )}

      {modes.sync === 'disabled' && modes.ai === 'disabled' && (
        <div className="services-page__first-run">
          Chrono 默认本地优先。如需多设备同步或 AI 助手，请在下方各项中选择 BYO 或 Managed 模式。
        </div>
      )}

      <SyncServiceSection />
      <AiServiceSection />
    </div>
  );
};
