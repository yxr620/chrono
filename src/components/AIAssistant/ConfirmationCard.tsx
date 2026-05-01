import React from 'react';
import type { ConfirmationCard as ConfirmationCardType } from '../../services/actions/types';
import './ConfirmationCard.css';

const CHANGE_ICON: Record<string, string> = {
  create: '＋',
  update: '✎',
  delete: '✕',
};

interface ConfirmationCardProps {
  card: ConfirmationCardType;
  onConfirm: () => void;
  onCancel: () => void;
  resolved?: 'confirmed' | 'cancelled';
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({ card, onConfirm, onCancel, resolved }) => {
  const riskClass = card.risk === 'high' ? 'confirm-card-high' : 'confirm-card-low';

  return (
    <div className={`confirm-card ${riskClass}`}>
      <div className="confirm-card-title">{card.title}</div>
      {card.description && (
        <div className="confirm-card-desc">{card.description}</div>
      )}
      <ul className="confirm-card-changes">
        {card.changes.map((c, i) => (
          <li key={i} className={`confirm-change confirm-change-${c.type}`}>
            <span className="confirm-change-icon">{CHANGE_ICON[c.type] || '•'}</span>
            <span className="confirm-change-summary">{c.summary}</span>
          </li>
        ))}
      </ul>
      {resolved ? (
        <div className={`confirm-card-resolved ${resolved === 'confirmed' ? 'confirm-resolved-ok' : 'confirm-resolved-cancel'}`}>
          {resolved === 'confirmed' ? '✓ 已执行' : '已取消'}
        </div>
      ) : (
        <div className="confirm-card-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>取消</button>
          <button className="confirm-btn-confirm" onClick={onConfirm}>✓ 确认执行</button>
        </div>
      )}
    </div>
  );
};
