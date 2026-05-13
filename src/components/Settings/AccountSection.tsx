import React, { useState } from 'react';
import {
  IonAccordion,
  IonAccordionGroup,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
} from '@ionic/react';
import { useAuthStore } from '../../stores/authStore';
import { SignInPage } from '../Auth/SignInPage';
import { DangerZoneContent } from './DangerZone';
import { MyDataContent } from './MyDataSection';

export const AccountSection: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [showSignIn, setShowSignIn] = useState(false);

  const managedAvailable = !!import.meta.env.VITE_AUTH_API_URL;
  if (!managedAvailable) return null;

  return (
    <IonCard className="settings-card" id="settings-account">
      <IonCardContent className="settings-card-content">
        {isAuthenticated ? (
          <>
            <div className="settings-account-row">
              <span className="settings-account-row__email">已登录：{user?.email}</span>
              <button
                type="button"
                className="settings-account-row__btn"
                onClick={() => logout()}
              >
                退出
              </button>
            </div>

            <div className="settings-accordion-wrap settings-account-accordion">
              <IonAccordionGroup>
                <IonAccordion value="account-data">
                  <IonItem slot="header" lines="none">
                    <IonLabel>Chrono 账号数据</IonLabel>
                  </IonItem>
                  <div className="settings-accordion-content" slot="content">
                    <MyDataContent />
                  </div>
                </IonAccordion>

                <IonAccordion value="account-actions">
                  <IonItem slot="header" lines="none">
                    <IonLabel>账号操作</IonLabel>
                  </IonItem>
                  <div className="settings-accordion-content" slot="content">
                    <DangerZoneContent />
                  </div>
                </IonAccordion>
              </IonAccordionGroup>
            </div>
          </>
        ) : (
          <div className="settings-account-row">
            <span className="settings-row-sub">
              登录后可使用 Chrono 托管同步与 AI 助手。
            </span>
            <button
              type="button"
              className="settings-account-row__btn settings-account-row__btn--primary"
              onClick={() => setShowSignIn(true)}
            >
              登录 / 注册
            </button>
          </div>
        )}
      </IonCardContent>
      {showSignIn && (
        <SignInPage onClose={() => setShowSignIn(false)} />
      )}
    </IonCard>
  );
};
