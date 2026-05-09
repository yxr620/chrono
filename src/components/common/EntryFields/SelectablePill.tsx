/**
 * 共享的可选/不可选小标签 + 分隔符
 * 抽自 TimeEntryForm 的 renderSelectableItem / renderSeparator
 */

import React from 'react';

interface PillProps {
  name: string;
  isSelected: boolean;
  activeColor: string;
  inactiveColor: string;
  isDark: boolean;
  onClick: () => void;
  suffix?: string;
}

export const SelectablePill: React.FC<PillProps> = ({
  name,
  isSelected,
  activeColor,
  inactiveColor,
  isDark,
  onClick,
  suffix,
}) => (
  <span
    onClick={onClick}
    style={{
      fontSize: '15px',
      fontWeight: isSelected ? '600' : '400',
      color: isSelected ? activeColor : (isDark ? '#94a3b8' : inactiveColor),
      cursor: 'pointer',
      transition: 'all 0.2s',
      userSelect: 'none',
    }}
  >
    {name}{suffix}
  </span>
);

export const PillSeparator: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <span style={{ color: isDark ? '#475569' : '#cbd5e1', fontSize: '14px', margin: '0 1px' }}>|</span>
);
