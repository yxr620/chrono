import React, { useState, useEffect, useRef } from 'react';
import type { WheelTimePickerHandle } from '../common/WheelTimePicker';
import {
  IonButton,
  IonInput,
  IonItem,
  IonIcon,
  IonCard,
  IonCardContent,
  IonModal
} from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import { playOutline, stopOutline, saveOutline, chatbubbleOutline, pricetagOutline, flagOutline, refreshOutline } from 'ionicons/icons';
import { useEntryStore } from '../../stores/entryStore';
import { useGoalStore } from '../../stores/goalStore';
import { useCategoryStore } from '../../stores/categoryStore';
import { useDateStore } from '../../stores/dateStore';
import { useAppToast } from '../../hooks/useAppToast';
import { useDarkMode } from '../../hooks/useDarkMode';
import dayjs from 'dayjs';
import { WheelTimePicker } from '../common/WheelTimePicker';
import { useIOSTimePicker } from '../../hooks/useIOSTimePicker';
import { predictMetadata, invalidatePredictionCache } from '../../services/metadataPredictor';

// ============ 工具函数 ============

const ensureDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

const alignDateWithTime = (time: Date, dateStr: string): Date => {
  const base = dayjs(dateStr);
  const timePart = dayjs(time);
  return base
    .hour(timePart.hour())
    .minute(timePart.minute())
    .second(timePart.second())
    .millisecond(timePart.millisecond())
    .toDate();
};

// ============ 样式常量 ============

const getCardStyle = (isDark: boolean): React.CSSProperties => ({
  margin: 0,
  borderRadius: '20px',
  background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#ffffff',
  boxShadow: 'none',
  border: 'none'
});


const TIME_DISPLAY_STYLE: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: 1.2,
  fontFamily: 'Monaco, Menlo, monospace',
  marginBottom: '6px'
};

const TIME_BADGE_STYLE: React.CSSProperties = {
  fontSize: '11px',
  padding: '4px 10px',
  borderRadius: '12px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer',
  transition: 'all 0.2s'
};

const ACTION_BUTTON_STYLE: React.CSSProperties = {
  height: '52px',
  fontSize: '17px',
  fontWeight: '600',
  '--border-radius': '26px',
  '--background': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  '--box-shadow': 'none',
  transition: 'all 0.2s',
  margin: 0
} as React.CSSProperties;

const getModalContentStyle = (isDark: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
  background: isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff'
});

const getPickerModalStyle = (isDark: boolean): React.CSSProperties => ({
  '--height': 'auto',
  '--width': '100%',
  '--border-radius': '16px 16px 0 0',
  '--background': isDark ? 'hsl(222.2, 84%, 4.9%)' : '#fff',
  '--box-shadow': 'none',
  alignItems: 'flex-end',
} as React.CSSProperties);

const MODAL_BUTTON_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '100px',
  padding: '0 0 16px 0'
};

// ============ 主组件 ============

export const TimeEntryForm: React.FC = () => {
  // Store hooks
  const {
    currentEntry,
    startTracking,
    stopTracking,
    addEntry,
    nextStartTime,
    nextEndTime,
    setTimeRange,
    getLastEntryEndTimeForDate,
    loadEntries
  } = useEntryStore();
  const { goals, loadGoals } = useGoalStore();
  const { categories, loadCategories } = useCategoryStore();
  const selectedDate = useDateStore(state => state.selectedDate);
  const setSelectedDate = useDateStore(state => state.setSelectedDate);
  const { isDark } = useDarkMode();
  const isIOS = Capacitor.getPlatform() === 'ios';
  const { openIOSTimePicker } = useIOSTimePicker();

  // Local state
  const [activity, setActivity] = useState('');
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState<Date | null>(new Date());
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [startPickerVisible, setStartPickerVisible] = useState(false);
  const [endPickerVisible, setEndPickerVisible] = useState(false);
  const [startDraftValue, setStartDraftValue] = useState<Date>(() => new Date());
  const [endDraftValue, setEndDraftValue] = useState<Date>(() => new Date());
  const startPickerRef = useRef<WheelTimePickerHandle>(null);
  const endPickerRef = useRef<WheelTimePickerHandle>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [present] = useAppToast();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  // 智能预选：追踪用户是否手动选过（手动选过就不再覆盖）
  const userPickedCategoryRef = useRef(false);
  const userPickedGoalRef = useRef(false);

  // ============ Effects ============

  // 初始化：加载数据（只执行一次）
  useEffect(() => {
    const init = async () => {
      await Promise.all([loadGoals(), loadCategories(), loadEntries()]);
      const today = dayjs().format('YYYY-MM-DD');
      const lastEndTime = getLastEntryEndTimeForDate(today);
      setStartTime(lastEndTime ? ensureDate(lastEndTime) : new Date());
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 智能预选：当活动名称变化时，防抖调用预测
  useEffect(() => {
    if (!activity.trim()) return;

    const timer = setTimeout(async () => {
      try {
        const result = await predictMetadata(activity, currentGoals);
        // 只在用户尚未手动选择时自动填充
        if (result.categoryId && !userPickedCategoryRef.current) {
          setSelectedCategoryId(result.categoryId);
        }
        if (result.goalId && !userPickedGoalRef.current) {
          setSelectedGoalId(result.goalId);
        }
      } catch {
        // 静默忽略预测错误
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  // 当从记录列表或时间轴点击时，自动设置开始时间和结束时间
  useEffect(() => {
    if (!nextStartTime) return;

    const normalizedStart = ensureDate(nextStartTime);
    setStartTime(alignDateWithTime(normalizedStart, selectedDate));

    if (nextEndTime) {
      setEndTime(alignDateWithTime(ensureDate(nextEndTime), selectedDate));
    } else {
      setEndTime(null);
    }
    setTimeRange(null as any, null as any);
  }, [nextStartTime, nextEndTime, selectedDate, setTimeRange]);

  // 当选中的日期发生变化时，更新开始时间
  useEffect(() => {
    const startDateStr = dayjs(startTime).format('YYYY-MM-DD');
    if (startDateStr === selectedDate) return;

    const lastEndTime = getLastEntryEndTimeForDate(selectedDate);
    if (lastEndTime) {
      setStartTime(alignDateWithTime(ensureDate(lastEndTime), selectedDate));
    } else {
      setStartTime(dayjs(selectedDate).startOf('day').toDate());
    }
    setEndTime(null);
  }, [selectedDate, startTime, getLastEntryEndTimeForDate]);

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

  // 更新计时器显示
  useEffect(() => {
    if (!currentEntry) {
      setElapsed('00:00:00');
      return;
    }

    const timer = setInterval(() => {
      const diff = dayjs().diff(dayjs(currentEntry.startTime), 'second');
      const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const seconds = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${hours}:${minutes}:${seconds}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [currentEntry]);

  // 响应式桌面检测
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============ 计算属性 ============

  const currentDateStr = selectedDate;
  const prevDateStr = dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD');
  const currentGoals = goals.filter(g => g.date === currentDateStr);
  const prevGoals = goals.filter(g => g.date === prevDateStr);
  const currentGoalNamesLower = currentGoals.map(g => g.name.toLowerCase().trim());
  const filteredPrevGoals = prevGoals.filter(
    g => !currentGoalNamesLower.includes(g.name.toLowerCase().trim())
  );
  const availableGoals = [...currentGoals, ...filteredPrevGoals];

  // ============ 事件处理 ============

  const showToast = (message: string, color: 'success' | 'danger' | 'warning') => {
    present({ message, duration: 1500, position: 'top', color });
  };

  const setEndTimeToOngoing = () => {
    setEndTime(null);
  };

  const setToNow = (isStart: boolean) => {
    const now = new Date();
    if (isStart) {
      setStartTime(now);
      setSelectedDate(dayjs(now).format('YYYY-MM-DD'));
    } else {
      if (now <= startTime) {
        showToast('结束时间须晚于开始', 'danger');
        return;
      }
      setEndTime(now);
    }
  };

  const resetForm = () => {
    setActivity('');
    setSelectedCategoryId('');
    setSelectedGoalId(null);
    setEndTime(new Date());
    userPickedCategoryRef.current = false;
    userPickedGoalRef.current = false;
    invalidatePredictionCache();
  };

  const getNextStartTime = () => {
    const lastEndTime = getLastEntryEndTimeForDate(selectedDate);
    return lastEndTime
      ? alignDateWithTime(ensureDate(lastEndTime), selectedDate)
      : alignDateWithTime(new Date(), selectedDate);
  };

  const handleStartTracking = async () => {
    if (!activity.trim()) {
      showToast('请输入活动名称', 'danger');
      return;
    }
    if (startTime > new Date()) {
      showToast('开始时间不能晚于当前', 'danger');
      return;
    }

    await startTracking(
      activity,
      selectedGoalId || undefined,
      startTime,
      selectedCategoryId || undefined
    );
    showToast('开始计时', 'success');
    resetForm();
    setStartTime(getNextStartTime());
  };

  const handleStopTracking = async () => {
    await stopTracking();
    showToast('已停止计时', 'success');
    setStartTime(getNextStartTime());
  };

  const handleSaveManualEntry = async () => {
    if (!activity.trim()) {
      showToast('请输入活动名称', 'danger');
      return;
    }
    if (startTime > new Date()) {
      showToast('开始时间不能晚于当前', 'danger');
      return;
    }
    if (!endTime) {
      showToast('请设置结束时间', 'warning');
      return;
    }
    if (endTime <= startTime) {
      showToast('结束时间须晚于开始', 'danger');
      return;
    }

    await addEntry({
      startTime,
      endTime,
      activity,
      categoryId: selectedCategoryId || null,
      goalId: selectedGoalId
    });
    showToast('记录已保存', 'success');

    const savedEndTime = endTime;
    resetForm();
    setStartTime(alignDateWithTime(savedEndTime, selectedDate));
  };

  // ============ 渲染辅助函数 ============

  const renderSelectableItem = (
    _id: string,
    name: string,
    isSelected: boolean,
    activeColor: string,
    inactiveColor: string,
    onClick: () => void,
    suffix?: string
  ) => (
    <span
      onClick={onClick}
      style={{
        fontSize: '15px',
        fontWeight: isSelected ? '600' : '400',
        color: isSelected ? activeColor : (isDark ? '#94a3b8' : inactiveColor),
        cursor: 'pointer',
        transition: 'all 0.2s',
        userSelect: 'none'
      }}
    >
      {name}{suffix}
    </span>
  );

  const renderSeparator = () => (
    <span style={{ color: isDark ? '#475569' : '#cbd5e1', fontSize: '14px', margin: '0 1px' }}>|</span>
  );

  const renderCategoryRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, color: isDark ? '#94a3b8' : '#999', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
        <IonIcon icon={pricetagOutline} style={{ fontSize: '13px' }} />
      </div>
      <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap', paddingRight: '4px' }}>
          {categories.map((c, index) => (
            <React.Fragment key={c.id}>
              {index > 0 && renderSeparator()}
              {renderSelectableItem(
                c.id,
                c.name,
                c.id === selectedCategoryId,
                '#3b82f6',
                '#666',
                () => { userPickedCategoryRef.current = true; setSelectedCategoryId(c.id === selectedCategoryId ? '' : c.id); }
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );

  const renderGoalRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, color: isDark ? '#94a3b8' : '#999', fontSize: '12px', fontWeight: '600' }}>
        <IonIcon icon={flagOutline} style={{ fontSize: '13px' }} />
      </div>
      <div style={{ height: '56px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {availableGoals.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', paddingRight: '4px' }}>
            {currentGoals.map((g, index) => (
              <React.Fragment key={g.id}>
                {index > 0 && renderSeparator()}
                {renderSelectableItem(
                  g.id!,
                  g.name,
                  g.id === selectedGoalId,
                  '#f59e0b',
                  '#666',
                  () => { userPickedGoalRef.current = true; setSelectedGoalId(g.id === selectedGoalId ? null : g.id!); }
                )}
              </React.Fragment>
            ))}
            {currentGoals.length > 0 && filteredPrevGoals.length > 0 && renderSeparator()}
            {filteredPrevGoals.map((g, index) => (
              <React.Fragment key={g.id}>
                {index > 0 && renderSeparator()}
                {renderSelectableItem(
                  g.id!,
                  g.name,
                  g.id === selectedGoalId,
                  '#f59e0b',
                  '#999',
                  () => { userPickedGoalRef.current = true; setSelectedGoalId(g.id === selectedGoalId ? null : g.id!); }
                )}
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

  // ============ 渲染 ============

  // 正在计时界面
  if (currentEntry) {
    return (
      <div style={{ padding: '20px 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 状态指示器 */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 181, 120, 0.1)',
              padding: '4px 10px',
              borderRadius: '16px'
            }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#00b578',
                boxShadow: '0 0 8px rgba(0, 181, 120, 0.5)'
              }} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#00b578' }}>
                正在计时
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: isDark ? '#f1f5f9' : '#333', marginTop: '12px' }}>
              {currentEntry.activity}
            </div>
          </div>

          {/* 计时器 */}
          <div style={{
            fontSize: '48px',
            fontWeight: '700',
            textAlign: 'center',
            fontFamily: 'Monaco, Menlo, Consolas, "Courier New", monospace',
            color: isDark ? '#f1f5f9' : '#333',
            letterSpacing: '-1px',
            margin: '10px 0'
          }}>
            {elapsed}
          </div>

          {/* 停止按钮 */}
          <IonButton
            expand="block"
            color="danger"
            shape="round"
            style={{
              height: '48px',
              fontSize: '18px',
              fontWeight: '600',
              '--box-shadow': 'none',
              marginTop: '10px'
            }}
            onClick={handleStopTracking}
          >
            <IonIcon slot="start" icon={stopOutline} />
            停止计时
          </IonButton>
        </div>
      </div>
    );
  }

  // 正常录入界面
  return (
    // <div style={{ padding: '16px', minHeight: '100%' }}>
    <div style={{ padding: '0 0 8px', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 活动名称输入 */}
      <IonCard style={getCardStyle(isDark)}>
        <IonCardContent style={{ padding: 0 }}>
          <IonItem
            lines="none"
            style={{ '--background': 'transparent', '--padding-start': '20px', '--padding-end': '20px' }}
          >
            <IonIcon
              icon={chatbubbleOutline}
              slot="start"
              style={{ color: isDark ? '#64748b' : '#bbb', fontSize: '20px', marginRight: '8px' }}
            />
            <IonInput
              placeholder="准备做什么？"
              value={activity}
              onIonInput={e => setActivity(e.detail.value!)}
              clearInput
              style={{
                fontSize: '17px',
                fontWeight: '500',
                '--placeholder-color': isDark ? '#64748b' : '#bbb',
                '--color': isDark ? '#f1f5f9' : '#333',
                paddingTop: '16px',
                paddingBottom: '16px'
              }}
            />
          </IonItem>
        </IonCardContent>
      </IonCard>

      {/* 类别选择 / 目标选择 */}
      {isDesktop ? (
        <>
          {/* 桌面端：类别和目标分开显示 */}
          <IonCard style={getCardStyle(isDark)}>
            <IonCardContent style={{ padding: '10px 16px' }}>
              {renderCategoryRow()}
            </IonCardContent>
          </IonCard>
          <IonCard style={getCardStyle(isDark)}>
            <IonCardContent style={{ padding: '10px 16px' }}>
              {renderGoalRow()}
            </IonCardContent>
          </IonCard>
        </>
      ) : (
        /* 移动端：类别和目标合并为一个卡片 */
        <IonCard style={getCardStyle(isDark)}>
          <IonCardContent style={{ padding: '10px 16px' }}>
            {renderCategoryRow()}
            {/* 分隔线 */}
            <div style={{ height: '1px', background: isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.2)', margin: '8px 0' }} />
            {renderGoalRow()}
          </IonCardContent>
        </IonCard>
      )}

      {/* 时间选择卡片 */}
      <IonCard style={getCardStyle(isDark)}>
        <IonCardContent style={{ padding: '12px 20px' }}>
          {/* 时间显示行：时间 + 箭头对齐 */}
          {(() => {
            const lastEndTime = getLastEntryEndTimeForDate(selectedDate);
            const lastEndDate = lastEndTime ? alignDateWithTime(ensureDate(lastEndTime), selectedDate) : null;
            const startIsLastEnd = lastEndDate !== null &&
              Math.abs(dayjs(startTime).diff(dayjs(lastEndDate), 'second')) < 5;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '8px' }}>
                  {/* 开始时间 */}
                  <div
                    style={{ flex: 1, cursor: 'pointer', minWidth: '80px' }}
                    onClick={() => {
                      if (isIOS) {
                        void openIOSTimePicker(startTime, (pickedDate) => {
                          if (pickedDate > new Date()) {
                            showToast('开始时间不能晚于当前', 'danger');
                            return;
                          }
                          setStartTime(pickedDate);
                          setSelectedDate(dayjs(pickedDate).format('YYYY-MM-DD'));
                        });
                        return;
                      }
                      setStartPickerVisible(true);
                    }}
                  >
                    <div style={{ ...TIME_DISPLAY_STYLE, marginBottom: 0, color: isDark ? '#f1f5f9' : '#333' }}>
                      {dayjs(startTime).format('HH:mm')}
                    </div>
                  </div>

                  {/* 时间轴箭头 */}
                  <div style={{ color: isDark ? '#475569' : '#d0d0d0', fontSize: '18px', flexShrink: 0, lineHeight: 1 }}>→</div>

                  {/* 结束时间 */}
                  <div
                    style={{ flex: 1, textAlign: 'right', cursor: 'pointer', minWidth: '80px' }}
                    onClick={() => {
                      if (isIOS) {
                        void openIOSTimePicker(endTime ?? new Date(), (pickedDate) => {
                          if (pickedDate <= startTime) {
                            showToast('结束时间须晚于开始', 'danger');
                            return;
                          }
                          setEndTime(pickedDate);
                        });
                        return;
                      }
                      setEndPickerVisible(true);
                    }}
                  >
                    <div style={{
                      ...TIME_DISPLAY_STYLE,
                      marginBottom: 0,
                      color: endTime ? (isDark ? '#f1f5f9' : '#333') : '#10b981',
                    }}>
                      {endTime ? dayjs(endTime).format('HH:mm') : '进行中'}
                    </div>
                  </div>
                </div>

                {/* 快捷按钮行 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {startIsLastEnd ? (
                    <span
                      onClick={(e) => { e.stopPropagation(); setToNow(true); }}
                      style={{
                        ...TIME_BADGE_STYLE,
                        color: isDark ? '#94a3b8' : '#666',
                        background: isDark ? 'rgba(51, 65, 85, 0.5)' : '#f7f8fa'
                      }}
                    >
                      <IonIcon icon={refreshOutline} style={{ fontSize: '12px' }} />
                      现在
                    </span>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (lastEndDate) {
                          setStartTime(lastEndDate);
                          setSelectedDate(dayjs(lastEndDate).format('YYYY-MM-DD'));
                        } else {
                          setToNow(true);
                        }
                      }}
                      style={{
                        ...TIME_BADGE_STYLE,
                        color: isDark ? '#94a3b8' : '#666',
                        background: isDark ? 'rgba(51, 65, 85, 0.5)' : '#f7f8fa'
                      }}
                    >
                      {lastEndDate ? '上次结束' : (
                        <><IonIcon icon={refreshOutline} style={{ fontSize: '12px' }} />现在</>
                      )}
                    </span>
                  )}
                  {/* 时长显示 */}
                  {(() => {
                    if (!endTime) return null;
                    const diffMinutes = dayjs(endTime).diff(dayjs(startTime), 'minute');
                    if (diffMinutes <= 0) return null;
                    const h = Math.floor(diffMinutes / 60);
                    const m = diffMinutes % 60;
                    const label = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
                    return (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: isDark ? '#64748b' : '#94a3b8',
                        letterSpacing: '0.2px'
                      }}>
                        {label}
                      </span>
                    );
                  })()}
                  {endTime === null ? (
                    <span
                      onClick={(e) => { e.stopPropagation(); setToNow(false); }}
                      style={{
                        ...TIME_BADGE_STYLE,
                        color: isDark ? '#94a3b8' : '#666',
                        background: isDark ? 'rgba(51, 65, 85, 0.5)' : '#f7f8fa'
                      }}
                    >
                      <IonIcon icon={refreshOutline} style={{ fontSize: '12px' }} />
                      现在
                    </span>
                  ) : (
                    <span
                      onClick={(e) => { e.stopPropagation(); setEndTimeToOngoing(); }}
                      style={{
                        ...TIME_BADGE_STYLE,
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.1)'
                      }}
                    >
                      进行中
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </IonCardContent>
      </IonCard>

      {/* 操作按钮 */}
      <IonButton
        expand="block"
        color="primary"
        onClick={endTime === null ? handleStartTracking : handleSaveManualEntry}
        disabled={!activity.trim()}
        style={ACTION_BUTTON_STYLE}
      >
        {endTime === null ? '开始计时' : '保存记录'}
        <IonIcon
          slot="end"
          icon={endTime === null ? playOutline : saveOutline}
          style={{ fontSize: '20px' }}
        />
      </IonButton>

      {/* 开始时间选择器 Modal */}
      {!isIOS && (
        <IonModal
          isOpen={startPickerVisible}
          onDidDismiss={() => setStartPickerVisible(false)}
          style={getPickerModalStyle(isDark)}
        >
          <div style={getModalContentStyle(isDark)}>
            <div style={MODAL_BUTTON_ROW_STYLE}>
              <IonButton fill="clear" onClick={() => setStartPickerVisible(false)}>
                取消
              </IonButton>
              <IonButton
                fill="clear"
                onClick={() => {
                  const liveValue = startPickerRef.current?.getCurrentValue() ?? startDraftValue;
                  if (liveValue > new Date()) {
                    showToast('开始时间不能晚于当前', 'danger');
                    return;
                  }
                  setStartTime(liveValue);
                  setSelectedDate(dayjs(liveValue).format('YYYY-MM-DD'));
                  setStartPickerVisible(false);
                }}
              >
                确定
              </IonButton>
            </div>
            <WheelTimePicker
              ref={startPickerRef}
              value={startDraftValue}
              onChange={setStartDraftValue}
              isDark={isDark}
            />
          </div>
        </IonModal>
      )}

      {/* 结束时间选择器 Modal */}
      {!isIOS && (
        <IonModal
          isOpen={endPickerVisible}
          onDidDismiss={() => setEndPickerVisible(false)}
          style={getPickerModalStyle(isDark)}
        >
          <div style={getModalContentStyle(isDark)}>
            <div style={MODAL_BUTTON_ROW_STYLE}>
              <IonButton fill="clear" onClick={() => setEndPickerVisible(false)}>
                取消
              </IonButton>
              <IonButton
                fill="clear"
                onClick={() => {
                  const liveValue = endPickerRef.current?.getCurrentValue() ?? endDraftValue;
                  if (liveValue <= startTime) {
                    showToast('结束时间须晚于开始', 'danger');
                    return;
                  }
                  setEndTime(liveValue);
                  setEndPickerVisible(false);
                }}
              >
                确定
              </IonButton>
            </div>
            <WheelTimePicker
              ref={endPickerRef}
              value={endDraftValue}
              onChange={setEndDraftValue}
              isDark={isDark}
            />
          </div>
        </IonModal>
      )}
    </div>
  );
};
