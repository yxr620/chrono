/**
 * 活动名输入框 — 抽自 TimeEntryForm 顶部的 IonInput + 气泡图标
 */

import React from 'react';
import { IonItem, IonInput, IonIcon } from '@ionic/react';
import { chatbubbleOutline } from 'ionicons/icons';
import { useDarkMode } from '../../../hooks/useDarkMode';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

export const ActivityInput: React.FC<Props> = ({ value, onChange, placeholder = '准备做什么？' }) => {
  const { isDark } = useDarkMode();
  return (
    <IonItem
      lines="none"
      style={{ '--background': 'transparent', '--padding-start': '20px', '--padding-end': '0px' }}
    >
      <IonIcon
        icon={chatbubbleOutline}
        slot="start"
        style={{ color: isDark ? '#64748b' : '#bbb', fontSize: '20px', marginRight: '8px' }}
      />
      <IonInput
        placeholder={placeholder}
        value={value}
        onIonInput={e => onChange(e.detail.value ?? '')}
        clearInput
        style={{
          fontSize: '17px',
          fontWeight: '500',
          '--placeholder-color': isDark ? '#64748b' : '#bbb',
          '--color': isDark ? '#f1f5f9' : '#333',
          paddingTop: '16px',
          paddingBottom: '16px',
        }}
      />
    </IonItem>
  );
};
