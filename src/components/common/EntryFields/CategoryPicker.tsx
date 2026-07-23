/**
 * 类别选择器 — 抽自 TimeEntryForm.renderCategoryRow
 * 横向滚动的小标签，单选；允许清空时，再次点击当前选中项会取消选择。
 */

import React from 'react';
import { IonIcon } from '@ionic/react';
import { pricetagOutline } from 'ionicons/icons';
import { useCategoryStore } from '../../../stores/categoryStore';
import { useDarkMode } from '../../../hooks/useDarkMode';
import { SelectablePill, PillSeparator } from './SelectablePill';

interface Props {
  selectedId: string;
  onChange: (next: string) => void;
  allowClear?: boolean;
}

export const CategoryPicker: React.FC<Props> = ({ selectedId, onChange, allowClear = true }) => {
  const { categories } = useCategoryStore();
  const { isDark } = useDarkMode();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
          color: isDark ? '#94a3b8' : '#999',
          fontSize: '12px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        <IonIcon icon={pricetagOutline} style={{ fontSize: '13px' }} />
      </div>
      <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: '6px',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            paddingRight: '4px',
          }}
        >
          {categories.map((c, index) => (
            <React.Fragment key={c.id}>
              {index > 0 && <PillSeparator isDark={isDark} />}
              <SelectablePill
                name={c.name}
                isSelected={c.id === selectedId}
                activeColor="#3b82f6"
                inactiveColor="#666"
                isDark={isDark}
                onClick={() => onChange(c.id === selectedId && allowClear ? '' : c.id)}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
