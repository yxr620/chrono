import React from 'react';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { SyncServiceSection } from './SyncServiceSection';
import './ServicesPage.css';

// TODO Task 4: replace with <AiServiceSection />
const AiServiceSectionStub: React.FC = () => (
  <section className="service-section">
    <header className="service-section__header">
      <span className="service-section__icon">🤖</span>
      <span className="service-section__title">AI 助手</span>
    </header>
    <p className="service-section__placeholder">AI 设置占位（Task 4 实装）</p>
  </section>
);

export const ServicesPage: React.FC = () => {
  const modes = useFeatureModeStore((s) => s.modes);
  const anyManaged = modes.sync === 'managed' || modes.ai === 'managed';

  return (
    <div className="services-page">
      <h2 className="services-page__title">服务</h2>
      <p className="services-page__hint">
        每项功能可独立选择关闭、使用自己的凭据（BYO）或由 Chrono 后端代理。
      </p>

      <SyncServiceSection />
      <AiServiceSectionStub />

      {anyManaged && (
        // TODO Plan 3: update banner copy before Managed is user-activatable
        <div className="services-page__signin-banner">
          <span>已启用 Managed 模式（暂未上线，等待 plan 3 的后端部署）</span>
        </div>
      )}
    </div>
  );
};
