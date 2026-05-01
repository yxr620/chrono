import React, { useState, useEffect, useRef } from 'react';
import type { WheelTimePickerHandle } from '../common/WheelTimePicker';
import {
  IonCard,
  IonCardContent,
  IonItem,
  IonIcon,
  IonInput,
  IonModal,
  IonButton,
} from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import { chatbubbleOutline, pricetagOutline, flagOutline } from 'ionicons/icons';
import { useGoalStore } from '../../stores/goalStore';
import { useCategoryStore } from '../../stores/categoryStore';
import { useEntryStore } from '../../stores/entryStore';
import { useAppToast } from '../../hooks/useAppToast';
import { useDarkMode } from '../../hooks/useDarkMode';
import { WheelTimePicker } from '../common/WheelTimePicker';
import { useIOSTimePicker } from '../../hooks/useIOSTimePicker';
import type { TimeEntry } from '../../services/db';
import dayjs from 'dayjs';
import './EditEntryDialog.css';

// ============ 工具函数 ============

interface EditEntryDialogProps {
  entry: TimeEntry | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<TimeEntry>) => Promise<void>;
}

export const EditEntryDialog: React.FC<EditEntryDialogProps> = ({
  entry,
  visible,
  onClose,
  onSave
}) => {
  const { entries } = useEntryStore();
  const { goals, loadGoals } = useGoalStore();
  const { categories, loadCategories } = useCategoryStore();
  const [activity, setActivity] = useState('');
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [startPickerVisible, setStartPickerVisible] = useState(false);
  const [endPickerVisible, setEndPickerVisible] = useState(false);
  const [startDraftValue, setStartDraftValue] = useState<Date>(() => new Date());
  const [endDraftValue, setEndDraftValue] = useState<Date>(() => new Date());
  const startPickerRef = useRef<WheelTimePickerHandle>(null);
  const endPickerRef = useRef<WheelTimePickerHandle>(null);
  const [present] = useAppToast();
  const { isDark } = useDarkMode();
  const isIOS = Capacitor.getPlatform() === 'ios';
  const { openIOSTimePicker } = useIOSTimePicker();

  useEffect(() => {
    if (visible) {
      loadGoals();
      loadCategories();
    }
  }, [visible, loadGoals, loadCategories]);

  useEffect(() => {
    if (entry) {
      setActivity(entry.activity);
      // 确保日期是 Date 对象
      setStartTime(entry.startTime instanceof Date ? entry.startTime : new Date(entry.startTime));
      setEndTime(entry.endTime ? (entry.endTime instanceof Date ? entry.endTime : new Date(entry.endTime)) : null);
      setSelectedCategoryId(entry.categoryId || '');
      setSelectedGoalId(entry.goalId || null);
    }
  }, [entry]);

  // 获取记录日期和昨天的目标
  const today = entry ? dayjs(entry.startTime).format('YYYY-MM-DD') : '';
  const yesterday = entry ? dayjs(entry.startTime).subtract(1, 'day').format('YYYY-MM-DD') : '';

  const todayGoals = entry ? goals.filter(g => g.date === today && (g.type ?? 'time') !== 'check') : [];
  const yesterdayGoals = entry ? goals.filter(g => g.date === yesterday && (g.type ?? 'time') !== 'check') : [];

  const entryDateGoals = [...todayGoals, ...yesterdayGoals];

  // 同步时间选择器草稿值
  useEffect(() => {
    if (startPickerVisible) {
      setStartDraftValue(startTime);
    }
  }, [startPickerVisible, startTime]);

  useEffect(() => {
    if (endPickerVisible) {
      setEndDraftValue(endTime ?? new Date());
    }
  }, [endPickerVisible, endTime]);

  // Toast helper
  const showToast = (message: string, color: 'success' | 'danger' | 'warning') => {
    present({ message, duration: 1500, position: 'top', color });
  };

  const handleSubmit = async () => {
    if (!entry?.id || !activity.trim()) {
      return;
    }

    if (startTime > new Date()) {
      showToast('开始时间不能晚于当前', 'danger');
      return;
    }

    if (endTime && endTime <= startTime) {
      showToast('结束时间须晚于开始', 'danger');
      return;
    }

    await onSave(entry.id, {
      activity,
      startTime,
      endTime,
      categoryId: selectedCategoryId || null,
      goalId: selectedGoalId
    });

    onClose();
  };

  // 获取上次记录的结束时间
  const getLastEndTime = () => {
    if (entries.length === 0) return null;
    // 排除当前正在编辑的记录
    const otherEntries = entries.filter(e => e.id !== entry?.id && e.endTime !== null);
    if (otherEntries.length === 0) return null;
    return otherEntries[0].endTime;
  };

  // 设置开始时间为"上次结束"
  const setStartTimeToLastEnd = () => {
    const lastEndTime = getLastEndTime();
    if (lastEndTime) {
      // 确保是 Date 对象
      setStartTime(lastEndTime instanceof Date ? lastEndTime : new Date(lastEndTime));
      showToast('已设为上次结束时间', 'success');
    } else {
      showToast('无上次结束记录', 'danger');
    }
  };

  // 设置当前时间
  const setToNow = (isStart: boolean) => {
    const now = new Date();
    if (isStart) {
      setStartTime(now);
    } else {
      setEndTime(now);
    }
  };

  // 设置结束时间为"正在进行"
  const setEndTimeToOngoing = () => {
    setEndTime(null);
    showToast('已设为正在进行', 'success');
  };

  if (!entry) return null;

  return (
    <>
      <IonModal
        isOpen={visible}
        onDidDismiss={onClose}
        initialBreakpoint={0.7}
        breakpoints={[0, 0.7, 1]}
      >
        <div className="edit-dialog-content">
          <h3 className="edit-dialog-title">编辑记录</h3>

          <div className="edit-dialog-body">
            {/* 活动名称 */}
            <IonCard className="edit-dialog-card">
              <IonCardContent style={{ padding: 0 }}>
                <IonItem lines="none" style={{ '--background': 'transparent', '--padding-start': '20px', '--padding-end': '20px' }}>
                  <IonIcon icon={chatbubbleOutline} slot="start" style={{ color: '#bbb', fontSize: '20px', marginRight: '8px' }} />
                  <IonInput
                    placeholder="输入活动名称"
                    value={activity}
                    onIonInput={e => setActivity(e.detail.value!)}
                    clearInput
                    className="edit-dialog-input"
                  />
                </IonItem>
              </IonCardContent>
            </IonCard>

            {/* 类别 */}
            <IonCard className="edit-dialog-card">
              <IonCardContent className="edit-dialog-card-body">
                <div className="edit-dialog-section-label">
                  <IonIcon icon={pricetagOutline} style={{ fontSize: '14px' }} />
                  类别
                </div>
                <div className="edit-dialog-options-scroll">
                  <div className="edit-dialog-options-row">
                    {categories.map((c, i) => (
                      <React.Fragment key={c.id}>
                        {i > 0 && <span className="edit-dialog-separator">|</span>}
                        <span
                          onClick={() => setSelectedCategoryId(c.id === selectedCategoryId ? '' : c.id)}
                          className={`edit-dialog-option ${c.id === selectedCategoryId ? 'selected' : ''}`}
                        >
                          {c.name}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </IonCardContent>
            </IonCard>

            {/* 关联目标 */}
            <IonCard className="edit-dialog-card">
              <IonCardContent className="edit-dialog-card-body">
                <div className="edit-dialog-section-label">
                  <IonIcon icon={flagOutline} style={{ fontSize: '14px' }} />
                  关联目标
                </div>
                <div className="edit-dialog-goals-box">
                  {entryDateGoals.length > 0 ? (
                    <div className="edit-dialog-options-wrap">
                      {todayGoals.map((g, i) => (
                        <React.Fragment key={g.id}>
                          {i > 0 && <span className="edit-dialog-separator">|</span>}
                          <span
                            onClick={() => setSelectedGoalId(g.id === selectedGoalId ? null : g.id!)}
                            className={`edit-dialog-option goal ${g.id === selectedGoalId ? 'selected' : ''}`}
                          >
                            {g.name}
                          </span>
                        </React.Fragment>
                      ))}
                      {todayGoals.length > 0 && yesterdayGoals.length > 0 && (
                        <span className="edit-dialog-separator">|</span>
                      )}
                      {yesterdayGoals.map((g, i) => (
                        <React.Fragment key={g.id}>
                          {i > 0 && <span className="edit-dialog-separator">|</span>}
                          <span
                            onClick={() => setSelectedGoalId(g.id === selectedGoalId ? null : g.id!)}
                            className={`edit-dialog-option goal yesterday ${g.id === selectedGoalId ? 'selected' : ''}`}
                          >
                            {g.name}*
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="edit-dialog-empty-hint">该日期暂无目标</div>
                  )}
                </div>
              </IonCardContent>
            </IonCard>

            {/* 时间选择 */}
            <div className="edit-dialog-time-row">
              <div className="edit-dialog-time-col">
                <div className="edit-dialog-time-label">开始时间</div>
                <IonButton expand="block" fill="outline" size="small" onClick={() => {
                  if (isIOS) { void openIOSTimePicker(startTime, (pickedDate) => {
                    if (pickedDate > new Date()) { showToast('开始时间不能晚于当前', 'danger'); return; }
                    setStartTime(pickedDate);
                  }); return; }
                  setStartPickerVisible(true);
                }}>
                  {dayjs(startTime).format('MM-DD HH:mm')}
                </IonButton>
                <div className="edit-dialog-time-actions">
                  <IonButton size="small" fill="outline" onClick={() => setToNow(true)}>现在</IonButton>
                  <IonButton size="small" fill="outline" color="primary" onClick={setStartTimeToLastEnd}>上次结束</IonButton>
                </div>
              </div>
              <div className="edit-dialog-time-col">
                <div className="edit-dialog-time-label">结束时间</div>
                <IonButton expand="block" fill="outline" size="small" onClick={() => {
                  if (isIOS) { void openIOSTimePicker(endTime ?? new Date(), setEndTime); return; }
                  setEndPickerVisible(true);
                }}>
                  {endTime ? dayjs(endTime).format('MM-DD HH:mm') : '进行中'}
                </IonButton>
                <div className="edit-dialog-time-actions">
                  <IonButton size="small" fill="outline" onClick={() => setToNow(false)}>现在</IonButton>
                  <IonButton size="small" fill="outline" color="warning" onClick={setEndTimeToOngoing}>进行中</IonButton>
                </div>
              </div>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="edit-dialog-footer">
            <div className="edit-dialog-footer-buttons">
              <IonButton expand="block" fill="outline" onClick={onClose}>取消</IonButton>
              <IonButton expand="block" onClick={handleSubmit} disabled={!activity.trim()}>保存</IonButton>
            </div>
          </div>
        </div>
      </IonModal>

      {/* 开始时间选择器（仅 Android）*/}
      {!isIOS && (
        <IonModal
          isOpen={startPickerVisible}
          onDidDismiss={() => setStartPickerVisible(false)}
          style={{
            '--height': 'auto',
            '--width': '100%',
            '--border-radius': '16px 16px 0 0',
            '--background': isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff',
            '--box-shadow': 'none',
            alignItems: 'flex-end',
          }}
        >
          <div className="edit-dialog-picker" style={{ background: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff' }}>
            <div className="edit-dialog-picker-header">
              <IonButton fill="clear" onClick={() => setStartPickerVisible(false)}>取消</IonButton>
              <IonButton fill="clear" onClick={() => { const liveValue = startPickerRef.current?.getCurrentValue() ?? startDraftValue; if (liveValue > new Date()) { showToast('开始时间不能晚于当前', 'danger'); return; } setStartTime(liveValue); setStartPickerVisible(false); }}>确定</IonButton>
            </div>
            <WheelTimePicker ref={startPickerRef} value={startDraftValue} onChange={setStartDraftValue} isDark={isDark} />
          </div>
        </IonModal>
      )}

      {/* 结束时间选择器（仅 Android）*/}
      {!isIOS && (
        <IonModal
          isOpen={endPickerVisible}
          onDidDismiss={() => setEndPickerVisible(false)}
          style={{
            '--height': 'auto',
            '--width': '100%',
            '--border-radius': '16px 16px 0 0',
            '--background': isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff',
            '--box-shadow': 'none',
            alignItems: 'flex-end',
          }}
        >
          <div className="edit-dialog-picker" style={{ background: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff' }}>
            <div className="edit-dialog-picker-header">
              <IonButton fill="clear" onClick={() => setEndPickerVisible(false)}>取消</IonButton>
              <IonButton fill="clear" onClick={() => { const liveValue = endPickerRef.current?.getCurrentValue() ?? endDraftValue; setEndTime(liveValue); setEndPickerVisible(false); }}>确定</IonButton>
            </div>
            <WheelTimePicker ref={endPickerRef} value={endDraftValue} onChange={setEndDraftValue} isDark={isDark} />
          </div>
        </IonModal>
      )}
    </>
  );
};
