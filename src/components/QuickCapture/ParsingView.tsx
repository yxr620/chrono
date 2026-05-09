import React from 'react';
import { IonSpinner } from '@ionic/react';

export const ParsingView: React.FC = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 16px',
      gap: 16,
    }}
  >
    <IonSpinner name="crescent" />
    <div style={{ fontSize: 14, color: '#94a3b8' }}>AI 正在整理…</div>
  </div>
);
