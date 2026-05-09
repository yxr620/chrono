import React, { useEffect, useRef } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { sparklesOutline } from 'ionicons/icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const TranscriptInput: React.FC<Props> = ({ value, onChange, onSubmit }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 自动 focus → 移动端键盘弹出 → 用户可点键盘麦克风用系统语音听写
    const t = setTimeout(() => ref.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="过去几小时干啥了？随便说，比如：9 点半到 11 写代码，开会到 11 半，然后吃饭到 12 点"
        style={{
          width: '100%',
          minHeight: 160,
          padding: 12,
          fontSize: 16,
          lineHeight: 1.5,
          borderRadius: 12,
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'transparent',
          color: 'inherit',
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <IonButton expand="block" disabled={!value.trim()} onClick={onSubmit}>
        <IonIcon slot="start" icon={sparklesOutline} />
        解析
      </IonButton>
    </div>
  );
};
