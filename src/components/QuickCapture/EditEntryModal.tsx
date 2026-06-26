import React, { useState, useEffect, useRef } from 'react';
import { IonModal, IonButton } from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import dayjs from 'dayjs';
import { useCategoryStore } from '../../stores/categoryStore';
import { useGoalStore } from '../../stores/goalStore';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useIOSTimePicker } from '../../hooks/useIOSTimePicker';
import { useAppToast } from '../../hooks/useAppToast';
import { ActivityInput, CategoryPicker, GoalPicker } from '../common/EntryFields';
import { WheelTimePicker, type WheelTimePickerHandle } from '../common/WheelTimePicker';
import type { AddEntryParams } from '../../services/quickCapture/quickCaptureParse';
import './EditEntryModal.css';

interface Props {
  isOpen: boolean;
  initial: AddEntryParams;
  onSave: (next: AddEntryParams) => void;
  onDelete: () => void;
  onCancel: () => void;
}

const hmToDate = (date: string, hm: string): Date => dayjs(`${date} ${hm}`).toDate();
const dateToHm = (d: Date): string => dayjs(d).format('HH:mm');
const dateToYmd = (d: Date): string => dayjs(d).format('YYYY-MM-DD');

const getPickerModalStyle = (isDark: boolean): React.CSSProperties => ({
  '--height': 'auto',
  '--width': '100%',
  '--border-radius': '16px 16px 0 0',
  '--background': isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff',
  '--box-shadow': 'none',
  alignItems: 'flex-end',
} as React.CSSProperties);

const getPickerContentStyle = (isDark: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
  background: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff',
});

export const EditEntryModal: React.FC<Props> = ({ isOpen, initial, onSave, onDelete, onCancel }) => {
  const { categories } = useCategoryStore();
  const { goals } = useGoalStore();
  const { isDark } = useDarkMode();
  const isIOS = Capacitor.getPlatform() === 'ios';
  const { openIOSTimePicker } = useIOSTimePicker();
  const [present] = useAppToast();

  // 表单状态（categoryId/goalId 为内部表示；提交时映射回 name）
  const [activity, setActivity] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [goalId, setGoalId] = useState<string | null>(null);

  // 时间选择器状态（仅非 iOS）
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [startDraft, setStartDraft] = useState<Date>(() => new Date());
  const [endDraft, setEndDraft] = useState<Date>(() => new Date());
  const startPickerRef = useRef<WheelTimePickerHandle>(null);
  const endPickerRef = useRef<WheelTimePickerHandle>(null);

  // Modal 打开时把 initial 注入表单（initial.category/goal 是 name，需转 id）
  useEffect(() => {
    if (!isOpen) return;
    setActivity(initial.activity);
    setDate(initial.date);
    setStartTime(initial.start_time);
    setEndTime(initial.end_time);
    setCategoryId(categories.find(c => c.name === initial.category)?.id ?? '');
    setGoalId(goals.find(g => g.name === initial.goal)?.id ?? null);
  }, [isOpen, initial, categories, goals]);

  const showError = (msg: string) => {
    present({ message: msg, duration: 1500, position: 'top', color: 'danger' });
  };

  const startPickerDateRangeBase = date && startTime ? hmToDate(date, startTime) : startDraft;
  const endPickerDateRangeBase = date && endTime ? hmToDate(date, endTime) : endDraft;

  // 起始 picker 同时决定日期；终止 picker 只取时间，沿用当前 date
  const applyStart = (picked: Date) => {
    setDate(dateToYmd(picked));
    setStartTime(dateToHm(picked));
  };

  const applyEnd = (picked: Date) => {
    const nextHm = dateToHm(picked);
    if (nextHm <= startTime) {
      showError('结束时间须晚于开始');
      return;
    }
    setEndTime(nextHm);
  };

  const openStartPicker = () => {
    if (!date || !startTime) return;
    const cur = hmToDate(date, startTime);
    if (isIOS) {
      void openIOSTimePicker(cur, applyStart);
      return;
    }
    setStartDraft(cur);
    setStartPickerOpen(true);
  };

  const openEndPicker = () => {
    if (!date || !endTime) return;
    const cur = hmToDate(date, endTime);
    if (isIOS) {
      void openIOSTimePicker(cur, applyEnd);
      return;
    }
    setEndDraft(cur);
    setEndPickerOpen(true);
  };

  const handleSave = () => {
    if (!activity.trim()) {
      showError('请输入活动');
      return;
    }
    if (!startTime || !endTime) {
      showError('请设置时间');
      return;
    }
    if (endTime <= startTime) {
      showError('结束时间须晚于开始');
      return;
    }
    onSave({
      date,
      start_time: startTime,
      end_time: endTime,
      activity: activity.trim(),
      category: categories.find(c => c.id === categoryId)?.name || undefined,
      goal: goals.find(g => g.id === goalId)?.name || undefined,
    });
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onCancel}>
      <div className="edit-entry-modal-content">
        <ActivityInput value={activity} onChange={setActivity} placeholder="活动名称" />

        <div className="edit-entry-time-row">
          <div className="edit-entry-time" onClick={openStartPicker}>
            {startTime || '--:--'}
          </div>
          <span style={{ color: '#94a3b8' }}>→</span>
          <div className="edit-entry-time" onClick={openEndPicker}>
            {endTime || '--:--'}
          </div>
        </div>

        <CategoryPicker selectedId={categoryId} onChange={setCategoryId} />

        <GoalPicker dateContext={date} selectedId={goalId} onChange={setGoalId} />

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

      {/* 开始时间选择器（非 iOS） */}
      {!isIOS && (
        <IonModal
          isOpen={startPickerOpen}
          onDidDismiss={() => setStartPickerOpen(false)}
          style={getPickerModalStyle(isDark)}
        >
          <div style={getPickerContentStyle(isDark)}>
            <div className="edit-entry-picker-buttons">
              <IonButton fill="clear" onClick={() => setStartPickerOpen(false)}>取消</IonButton>
              <IonButton
                fill="clear"
                onClick={() => {
                  const live = startPickerRef.current?.getCurrentValue() ?? startDraft;
                  applyStart(live);
                  setStartPickerOpen(false);
                }}
              >
                确定
              </IonButton>
            </div>
            <WheelTimePicker
              ref={startPickerRef}
              value={startDraft}
              onChange={setStartDraft}
              isDark={isDark}
              dateRangeBase={startPickerDateRangeBase}
            />
          </div>
        </IonModal>
      )}

      {/* 结束时间选择器（非 iOS） */}
      {!isIOS && (
        <IonModal
          isOpen={endPickerOpen}
          onDidDismiss={() => setEndPickerOpen(false)}
          style={getPickerModalStyle(isDark)}
        >
          <div style={getPickerContentStyle(isDark)}>
            <div className="edit-entry-picker-buttons">
              <IonButton fill="clear" onClick={() => setEndPickerOpen(false)}>取消</IonButton>
              <IonButton
                fill="clear"
                onClick={() => {
                  const live = endPickerRef.current?.getCurrentValue() ?? endDraft;
                  const liveHm = dateToHm(live);
                  if (liveHm <= startTime) {
                    showError('结束时间须晚于开始');
                    return;
                  }
                  setEndTime(liveHm);
                  setEndPickerOpen(false);
                }}
              >
                确定
              </IonButton>
            </div>
            <WheelTimePicker
              ref={endPickerRef}
              value={endDraft}
              onChange={setEndDraft}
              isDark={isDark}
              dateRangeBase={endPickerDateRangeBase}
            />
          </div>
        </IonModal>
      )}
    </IonModal>
  );
};
