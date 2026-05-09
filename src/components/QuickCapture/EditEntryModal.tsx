import React, { useState, useEffect } from 'react';
import { IonModal, IonInput, IonButton } from '@ionic/react';
import dayjs from 'dayjs';
import { useCategoryStore } from '../../stores/categoryStore';
import { useGoalStore } from '../../stores/goalStore';
import type { AddEntryParams } from '../../services/quickCapture/quickCaptureParse';
import './EditEntryModal.css';

interface Props {
  isOpen: boolean;
  initial: AddEntryParams;
  onSave: (next: AddEntryParams) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export const EditEntryModal: React.FC<Props> = ({ isOpen, initial, onSave, onDelete, onCancel }) => {
  const { categories } = useCategoryStore();
  const { goals } = useGoalStore();

  const [activity, setActivity] = useState(initial.activity);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.start_time);
  const [endTime, setEndTime] = useState(initial.end_time);
  const [categoryName, setCategoryName] = useState(initial.category ?? '');
  const [goalName, setGoalName] = useState(initial.goal ?? '');

  useEffect(() => {
    if (isOpen) {
      setActivity(initial.activity);
      setDate(initial.date);
      setStartTime(initial.start_time);
      setEndTime(initial.end_time);
      setCategoryName(initial.category ?? '');
      setGoalName(initial.goal ?? '');
    }
  }, [isOpen, initial]);

  const dateGoals = goals.filter(
    g => !g.deleted && (g.type ?? 'time') !== 'check' && g.date === date,
  );

  const handleSave = () => {
    if (!activity.trim()) return;
    if (!startTime || !endTime) return;
    const startDate = dayjs(`${date} ${startTime}`);
    const endDate = dayjs(`${date} ${endTime}`);
    if (!startDate.isValid() || !endDate.isValid()) return;
    if (!endDate.isAfter(startDate)) return;

    onSave({
      date,
      start_time: startTime,
      end_time: endTime,
      activity: activity.trim(),
      category: categoryName || undefined,
      goal: goalName || undefined,
    });
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onCancel}>
      <div className="edit-entry-modal-content">
        <div className="edit-entry-row">
          <span className="edit-entry-label">活动</span>
          <IonInput
            value={activity}
            onIonInput={e => setActivity(e.detail.value ?? '')}
            placeholder="活动名称"
            style={{ flex: 1 }}
          />
        </div>

        <div className="edit-entry-row">
          <span className="edit-entry-label">日期</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ flex: 1, padding: '6px 8px' }}
          />
        </div>

        <div className="edit-entry-time-row">
          <input
            type="time"
            className="edit-entry-time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
          <span style={{ color: '#94a3b8' }}>→</span>
          <input
            type="time"
            className="edit-entry-time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          />
        </div>

        <div>
          <div className="edit-entry-label" style={{ marginBottom: 4 }}>类别</div>
          <div>
            <span
              className={`edit-entry-pill ${!categoryName ? 'selected' : ''}`}
              onClick={() => setCategoryName('')}
            >
              无
            </span>
            {categories.map(c => (
              <span
                key={c.id}
                className={`edit-entry-pill ${categoryName === c.name ? 'selected' : ''}`}
                onClick={() => setCategoryName(c.name)}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="edit-entry-label" style={{ marginBottom: 4 }}>目标</div>
          <div>
            <span
              className={`edit-entry-pill goal ${!goalName ? 'selected' : ''}`}
              onClick={() => setGoalName('')}
            >
              无
            </span>
            {dateGoals.map(g => (
              <span
                key={g.id}
                className={`edit-entry-pill goal ${goalName === g.name ? 'selected' : ''}`}
                onClick={() => setGoalName(g.name)}
              >
                {g.name}
              </span>
            ))}
            {dateGoals.length === 0 && (
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
                该日期暂无目标
              </span>
            )}
          </div>
        </div>

        <div className="edit-entry-actions">
          <IonButton fill="clear" className="edit-entry-delete" onClick={onDelete}>
            删除此条
          </IonButton>
          <div style={{ display: 'flex', gap: 8 }}>
            <IonButton fill="clear" onClick={onCancel}>取消</IonButton>
            <IonButton onClick={handleSave}>保存</IonButton>
          </div>
        </div>
      </div>
    </IonModal>
  );
};
