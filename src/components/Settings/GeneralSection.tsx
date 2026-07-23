import React, { useState } from 'react';
import { IonCard, IonCardContent, IonToggle } from '@ionic/react';
import { useDarkMode } from '../../hooks/useDarkMode';
import { isAutoMergeEnabled, setAutoMergeEnabled } from '../../services/autoMerge';
import {
  isEntryCategoryRequired,
  setEntryCategoryRequired,
} from '../../services/categoryAssignmentPreference';

export const GeneralSection: React.FC = () => {
  const { isDark, setDark } = useDarkMode();
  const [autoMerge, setAutoMerge] = useState<boolean>(() => isAutoMergeEnabled());
  const [categoryRequired, setCategoryRequired] = useState<boolean>(
    () => isEntryCategoryRequired(),
  );

  const handleAutoMergeChange = (checked: boolean) => {
    setAutoMerge(checked);
    setAutoMergeEnabled(checked);
  };

  const handleCategoryRequiredChange = (checked: boolean) => {
    setCategoryRequired(checked);
    setEntryCategoryRequired(checked);
  };

  return (
    <IonCard className="settings-card">
      <IonCardContent className="settings-card-content">
        <div className="settings-row">
          <div className="settings-row-label">深色模式</div>
          <IonToggle checked={isDark} onIonChange={(e) => setDark(e.detail.checked)} />
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">每条记录自动关联 Category</div>
            <div className="settings-row-sub">
              开启后会根据活动历史自动选择最可能的 Category；没有相似记录时使用最近 60 天最常用的 Category。
            </div>
          </div>
          <IonToggle
            checked={categoryRequired}
            onIonChange={(e) => handleCategoryRequiredChange(e.detail.checked)}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">自动合并相邻重复记录</div>
            <div className="settings-row-sub">
              新建或结束计时后，若紧邻的上一条记录的活动、类别、目标、备注完全相同，自动合并为一条。仅作用于本次操作的记录，不会改动其他历史。
            </div>
          </div>
          <IonToggle checked={autoMerge} onIonChange={(e) => handleAutoMergeChange(e.detail.checked)} />
        </div>
      </IonCardContent>
    </IonCard>
  );
};
