/**
 * 目标选择器 — 抽自 TimeEntryForm.renderGoalRow
 * 显示 dateContext 当天的 time 型目标 + 前一天的目标（去重 by name）
 * 单选；再次点击当前选中 → 取消选择（onChange 传 null）
 */

import React from 'react';
import { IonIcon } from '@ionic/react';
import { flagOutline } from 'ionicons/icons';
import dayjs from 'dayjs';
import { useGoalStore } from '../../../stores/goalStore';
import { useDarkMode } from '../../../hooks/useDarkMode';
import { SelectablePill, PillSeparator } from './SelectablePill';

interface Props {
  /** 'YYYY-MM-DD'：决定哪天的目标算"当前"，前一天的目标作为补充列在后面 */
  dateContext: string;
  selectedId: string | null;
  onChange: (next: string | null) => void;
}

export const GoalPicker: React.FC<Props> = ({ dateContext, selectedId, onChange }) => {
  const { goals } = useGoalStore();
  const { isDark } = useDarkMode();

  // 时间记录只能关联 time 型目标；check 型不参与
  const trackableGoals = goals.filter(g => (g.type ?? 'time') !== 'check');
  const prevDateStr = dayjs(dateContext).subtract(1, 'day').format('YYYY-MM-DD');
  const currentGoals = trackableGoals.filter(g => g.date === dateContext);
  const prevGoals = trackableGoals.filter(g => g.date === prevDateStr);
  const currentNamesLower = currentGoals.map(g => g.name.toLowerCase().trim());
  const filteredPrevGoals = prevGoals.filter(
    g => !currentNamesLower.includes(g.name.toLowerCase().trim()),
  );
  const total = currentGoals.length + filteredPrevGoals.length;

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
        }}
      >
        <IonIcon icon={flagOutline} style={{ fontSize: '13px' }} />
      </div>
      <div style={{ height: '56px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {total > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              alignItems: 'center',
              paddingRight: '4px',
            }}
          >
            {currentGoals.map((g, index) => (
              <React.Fragment key={g.id}>
                {index > 0 && <PillSeparator isDark={isDark} />}
                <SelectablePill
                  name={g.name}
                  isSelected={g.id === selectedId}
                  activeColor="#f59e0b"
                  inactiveColor="#666"
                  isDark={isDark}
                  onClick={() => onChange(g.id === selectedId ? null : g.id!)}
                />
              </React.Fragment>
            ))}
            {currentGoals.length > 0 && filteredPrevGoals.length > 0 && (
              <PillSeparator isDark={isDark} />
            )}
            {filteredPrevGoals.map((g, index) => (
              <React.Fragment key={g.id}>
                {index > 0 && <PillSeparator isDark={isDark} />}
                <SelectablePill
                  name={g.name}
                  isSelected={g.id === selectedId}
                  activeColor="#f59e0b"
                  inactiveColor="#999"
                  isDark={isDark}
                  onClick={() => onChange(g.id === selectedId ? null : g.id!)}
                />
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div style={{ color: isDark ? '#475569' : '#bbb', fontSize: '14px' }}>
            该日期暂无目标
          </div>
        )}
      </div>
    </div>
  );
};
