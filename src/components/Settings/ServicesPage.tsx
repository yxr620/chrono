import React from 'react';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { AiServiceSection } from './AiServiceSection';
import { SyncServiceSection } from './SyncServiceSection';
import './ServicesPage.css';

export const ServicesPage: React.FC = () => {
  const modes = useFeatureModeStore((s) => s.modes);
  const anyManaged = modes.sync === 'managed' || modes.ai === 'managed';

  return (
    <div className="services-page">
      <h2 className="services-page__title">服务</h2>
      <p className="services-page__hint">
        每项功能可独立选择关闭、使用自己的凭据（BYO）或由 Chrono 后端代理。
      </p>

      {modes.sync === 'disabled' && modes.ai === 'disabled' && (
        <div className="services-page__first-run">
          Chrono 默认本地优先。如需多设备同步或 AI 助手，请在下方各项中选择 BYO 或 Managed 模式。
        </div>
      )}

      <SyncServiceSection />
      <AiServiceSection />

      {anyManaged && (
        // TODO Plan 3: update banner copy before Managed is user-activatable
        <div className="services-page__signin-banner">
          <span>已启用 Managed 模式（暂未上线，等待 plan 3 的后端部署）</span>
        </div>
      )}
    </div>
  );
};
