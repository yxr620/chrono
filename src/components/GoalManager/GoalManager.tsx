import React, { useState, useEffect, useRef } from 'react';
import {
  IonModal,
  IonContent,
  IonButton,
  IonInput,
  useIonAlert,
  IonCard,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonText,
  IonSegment,
  IonSegmentButton
} from '@ionic/react';
import {
  addOutline,
  createOutline,
  trashOutline,
  chevronBackOutline,
  chevronForwardOutline,
  calendarOutline,
  checkmarkCircle,
  ellipseOutline,
  chatbubbleEllipsesOutline,
  sparklesOutline
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { useGoalStore } from '../../stores/goalStore';
import { useEntryStore } from '../../stores/entryStore';
import { useDateStore } from '../../stores/dateStore';
import { useAppToast } from '../../hooks/useAppToast';
import { useDarkMode } from '../../hooks/useDarkMode';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import type { Goal } from '../../services/db';
import { suggestGoals } from '../../services/goalSuggester';
import { TimeInjectionMatrix } from './TimeInjectionMatrix';
import './GoalManager.css';

dayjs.extend(isSameOrBefore);

export const GoalManager: React.FC = () => {
  const { isDark } = useDarkMode();
  const currentDate = useDateStore(state => state.selectedDate);
  const setSelectedDate = useDateStore(state => state.setSelectedDate);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalType, setNewGoalType] = useState<'time' | 'check'>('time');
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editGoalName, setEditGoalName] = useState('');
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [injectionMode, setInjectionMode] = useState<'relative' | 'absolute'>('relative');

  // Desktop breakpoint detection (same as App.tsx)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [present] = useAppToast();
  const [presentAlert] = useIonAlert();

  // 目标建议相关状态
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const addInputRef = useRef<HTMLIonInputElement>(null);
  const editInputRef = useRef<HTMLIonInputElement>(null);

  // Platform-specific modal breakpoints
  // iOS: keyboard overlays content, need taller modal (0.42) to keep button + segment visible above keyboard
  // Android: adjustResize compresses entire WebView, smaller modal (0.30) to avoid excess whitespace
  const isIOS = Capacitor.getPlatform() === 'ios';
  const modalBreakpoint = isIOS ? 0.42 : 0.30;

  const { goals, loadGoals, addGoal, updateGoal, deleteGoal, toggleCompletion } = useGoalStore();
  const { entries, loadEntries, getEarliestEntryDate } = useEntryStore();
  const earliestDate = getEarliestEntryDate();

  useEffect(() => {
    loadGoals();
    loadEntries(currentDate);
  }, [currentDate, loadEntries, loadGoals]);

  // 获取当天的目标，并按类型拆分
  const todayGoals = goals.filter(g => g.date === currentDate);
  const timeGoals = todayGoals.filter(g => (g.type ?? 'time') === 'time');
  const checkGoals = todayGoals.filter(g => (g.type ?? 'time') === 'check');
  const completedCheckCount = checkGoals.filter(g => g.completed).length;

  // 当天的感想（带 memo 的 entry，按开始时间倒序）
  const dayMemos = entries
    .filter(e => {
      if (!e.memo || !e.memo.trim()) return false;
      return dayjs(e.startTime).format('YYYY-MM-DD') === currentDate;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // 计算某个目标的花费时长（分钟）
  const calculateGoalDuration = (goalId: string) => {
    const goalEntries = entries.filter(e => e.goalId === goalId && e.endTime);
    return goalEntries.reduce((total, entry) => {
      if (!entry.endTime) return total;
      const duration = dayjs(entry.endTime).diff(entry.startTime, 'minute');
      return total + duration;
    }, 0);
  };

  // 格式化时长显示
  const formatDuration = (minutes: number) => {
    if (minutes === 0) return '0分钟';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}分钟`;
    if (mins === 0) return `${hours}小时`;
    return `${hours}小时${mins}分钟`;
  };

  // 日期切换
  const isEarliestDay = earliestDate ? dayjs(currentDate).isSameOrBefore(dayjs(earliestDate), 'day') : false;

  const handlePrevDay = () => {
    if (isEarliestDay) return;
    const prevDay = dayjs(currentDate).subtract(1, 'day').format('YYYY-MM-DD');
    setSelectedDate(prevDay);
  };

  const handleNextDay = () => {
    const nextDay = dayjs(currentDate).add(1, 'day').format('YYYY-MM-DD');
    setSelectedDate(nextDay);
  };

  const handleToday = () => {
    setSelectedDate(dayjs().format('YYYY-MM-DD'));
  };

  // 添加目标
  const handleAddGoal = async () => {
    if (!newGoalName.trim()) {
      present({
        message: '请输入目标名称',
        duration: 1500,
        position: 'top',
        color: 'danger'
      });
      return;
    }

    await addGoal({
      name: newGoalName.trim(),
      date: currentDate,
      type: newGoalType,
      color: newGoalType === 'check' ? '#94a3b8' : '#1677ff'
    });

    setNewGoalName('');
    setNewGoalType('time');
    setShowAddGoal(false);
  };

  // 删除目标
  const handleDeleteGoal = (goal: Goal) => {
    presentAlert({
      header: '确认删除',
      message: `确认删除目标"${goal.name}"吗？`,
      buttons: [
        {
          text: '取消',
          role: 'cancel',
        },
        {
          text: '确认',
          role: 'confirm',
          handler: async () => {
            await deleteGoal(goal.id!);
            present({
              message: '目标已删除',
              duration: 1500,
              position: 'top',
              color: 'success'
            });
          },
        },
      ],
    });
  };

  // 打开编辑弹窗
  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setEditGoalName(goal.name);
    setShowEditGoal(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editGoalName.trim()) {
      present({
        message: '请输入目标名称',
        duration: 1500,
        position: 'top',
        color: 'danger'
      });
      return;
    }

    if (!editingGoal?.id) return;

    await updateGoal(editingGoal.id, {
      name: editGoalName.trim()
    });

    setEditingGoal(null);
    setEditGoalName('');
    setShowEditGoal(false);
    present({
      message: '目标已更新',
      duration: 1500,
      position: 'top',
      color: 'success'
    });
  };

  // 获取日期显示文本
  const getDateDisplayText = () => {
    const today = dayjs().format('YYYY-MM-DD');
    if (currentDate === today) return '今天';

    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    if (currentDate === yesterday) return '昨天';

    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    if (currentDate === tomorrow) return '明天';

    return dayjs(currentDate).format('MM月DD日');
  };

  // 计算总时长（只统计 time 型目标；check 型不参与时长统计）
  const totalDuration = timeGoals.reduce((total, goal) => {
    return total + calculateGoalDuration(goal.id!);
  }, 0);

  const isToday = currentDate === dayjs().format('YYYY-MM-DD');

  // 注入矩阵：月份导航
  const matrixMonth = dayjs(currentDate).format('YYYY-MM');
  const canGoNextMonth = matrixMonth < dayjs().format('YYYY-MM');
  const canGoPrevMonth = !earliestDate || matrixMonth > dayjs(earliestDate).format('YYYY-MM');

  const handlePrevMonth = () => {
    const target = dayjs(currentDate).subtract(1, 'month');
    setSelectedDate(target.format('YYYY-MM-DD'));
  };

  const handleNextMonth = () => {
    const target = dayjs(currentDate).add(1, 'month');
    const today = dayjs();
    if (target.isAfter(today, 'day')) {
      setSelectedDate(today.format('YYYY-MM-DD'));
    } else {
      setSelectedDate(target.format('YYYY-MM-DD'));
    }
  };

  // ─── Shared sub-components ────────────────────────────────────────

  const dateHeaderContent = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px'
      }}
    >
      <IonButton
        fill="clear" color="medium" size="small"
        onClick={handlePrevDay} disabled={isEarliestDay}
        style={{ '--padding-start': '4px', '--padding-end': '4px', height: '32px', minHeight: '32px' }}
      >
        <IonIcon icon={chevronBackOutline} slot="icon-only" style={{ fontSize: '16px' }} />
      </IonButton>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          cursor: isDesktop ? 'default' : 'pointer',
          padding: '4px 0',
          userSelect: 'none'
        }}
        onClick={isDesktop ? undefined : () => setMatrixExpanded(v => !v)}
      >
        <IonIcon icon={calendarOutline} style={{ fontSize: '15px', color: isDark ? '#94a3b8' : '#64748b' }} />
        <span style={{
          fontSize: '15px', fontWeight: 700,
          color: isDark ? '#f1f5f9' : '#0f172a'
        }}>
          {getDateDisplayText()}
        </span>
        <span style={{ color: isDark ? '#475569' : '#cbd5e1', fontSize: '14px' }}>·</span>
        <span style={{
          fontSize: '15px', fontWeight: 600,
          color: '#3b82f6'
        }}>
          {formatDuration(totalDuration)}
        </span>
      </div>

      <IonButton
        fill="clear" color="medium" size="small"
        onClick={handleNextDay}
        style={{ '--padding-start': '4px', '--padding-end': '4px', height: '32px', minHeight: '32px' }}
      >
        <IonIcon icon={chevronForwardOutline} slot="icon-only" style={{ fontSize: '16px' }} />
      </IonButton>
    </div>
  );

  const backToTodayButton = !isToday ? (
    <div style={{ textAlign: 'center', marginTop: '6px' }}>
      <IonButton
        fill="clear" size="small" color="primary"
        onClick={handleToday}
        style={{ fontSize: '13px', fontWeight: 600, height: '26px', minHeight: '26px' }}
      >
        回到今天
      </IonButton>
    </div>
  ) : null;

  const matrixContent = (
    <TimeInjectionMatrix
      entries={entries}
      month={matrixMonth}
      selectedDate={currentDate}
      injectionMode={injectionMode}
      onInjectionModeChange={setInjectionMode}
      onSelectDate={(date) => setSelectedDate(date)}
      onPrevMonth={handlePrevMonth}
      onNextMonth={handleNextMonth}
      canGoNextMonth={canGoNextMonth}
      canGoPrevMonth={canGoPrevMonth}
      isDark={isDark}
    />
  );

  const cardStyle = {
    margin: 0,
    borderRadius: '20px',
    background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#ffffff',
    boxShadow: 'none',
    border: 'none'
  };

  return (
    <div
      className="goal-manager-root"
      style={{
        padding: '16px',
        paddingBottom: '80px',
        minHeight: '100%'
      }}
    >
      {/* 日期切换头部 — 始终全宽 */}
      <IonCard style={{ ...cardStyle, marginBottom: '1rem' }}>
        <IonCardContent style={{ padding: '10px 12px' }}>
          {dateHeaderContent}

          {!isDesktop && backToTodayButton}

          {/* Mobile: expandable injection matrix (inside header card) */}
          {!isDesktop && matrixExpanded && (
            <div>
              {matrixContent}
            </div>
          )}
        </IonCardContent>
      </IonCard>

      {/* ── Body: dual-column on desktop, stacked on mobile ── */}
      <div className="goal-manager-body">

        {/* ── Left: 目标列表 ── */}
        <div className="goal-manager-left">
          <IonCard style={cardStyle}>
            <IonCardContent style={{ paddingBottom: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}
              >
                <IonText>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                    目标列表 ({timeGoals.length})
                  </h3>
                </IonText>
                <IonButton
                  size="small"
                  fill="clear"
                  color="medium"
                  onClick={() => setShowAddGoal(true)}
                  style={{
                    '--padding-start': '8px',
                    '--padding-end': '8px',
                    '--padding-top': '6px',
                    '--padding-bottom': '6px',
                    height: '32px',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  <IonIcon icon={addOutline} slot="start" style={{ fontSize: '18px' }} />
                  添加目标
                </IonButton>
              </div>

              {timeGoals.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: isDark ? '#94a3b8' : '#9ca3af'
                  }}
                >
                  {!showSuggestions ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                      <div>暂无目标，点击上方按钮添加</div>
                      {isToday && (
                        <IonButton
                          fill="outline"
                          size="small"
                          color="primary"
                          disabled={loadingSuggestions}
                          onClick={async () => {
                            setLoadingSuggestions(true);
                            try {
                              const result = await suggestGoals(timeGoals.map(g => g.name));
                              if (result.length === 0) {
                                present({ message: '暂无可推荐目标', duration: 1500, position: 'top', color: 'warning' });
                              } else {
                                setSuggestions(result);
                                setSelectedSuggestions(new Set(result));
                                setShowSuggestions(true);
                              }
                            } finally {
                              setLoadingSuggestions(false);
                            }
                          }}
                          style={{
                            '--border-radius': '16px',
                            fontWeight: 600,
                            fontSize: '14px'
                          }}
                        >
                          {!loadingSuggestions && (
                            <IonIcon icon={sparklesOutline} slot="start" />
                          )}
                          {loadingSuggestions ? '加载中...' : '建议今日目标'}
                        </IonButton>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'left' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: isDark ? '#e2e8f0' : '#334155',
                        marginBottom: '12px',
                        textAlign: 'center'
                      }}>
                        根据历史记录推荐
                      </div>
                      {suggestions.map(name => {
                        const isChecked = selectedSuggestions.has(name);
                        return (
                          <div
                            key={name}
                            onClick={() => {
                              const next = new Set(selectedSuggestions);
                              if (isChecked) next.delete(name);
                              else next.add(name);
                              setSelectedSuggestions(next);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '12px',
                              cursor: 'pointer',
                              background: isChecked
                                ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                : 'transparent',
                              transition: 'background 0.15s',
                              marginBottom: '4px'
                            }}
                          >
                            <span style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '6px',
                              border: isChecked ? '2px solid #3b82f6' : `2px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                              background: isChecked ? '#3b82f6' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontSize: '12px',
                              color: '#fff',
                              transition: 'all 0.15s'
                            }}>
                              {isChecked && '✓'}
                            </span>
                            <span style={{
                              fontSize: '15px',
                              fontWeight: 500,
                              color: isDark ? '#e2e8f0' : '#1e293b'
                            }}>
                              {name}
                            </span>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'center' }}>
                        <IonButton
                          fill="clear"
                          size="small"
                          color="medium"
                          onClick={() => {
                            setShowSuggestions(false);
                            setSuggestions([]);
                            setSelectedSuggestions(new Set());
                          }}
                        >
                          取消
                        </IonButton>
                        <IonButton
                          size="small"
                          disabled={selectedSuggestions.size === 0}
                          onClick={async () => {
                            for (const name of selectedSuggestions) {
                              await addGoal({ name, date: currentDate, type: 'time', color: '#1677ff' });
                            }
                            present({
                              message: `已添加 ${selectedSuggestions.size} 个目标`,
                              duration: 1500,
                              position: 'top',
                              color: 'success'
                            });
                            setShowSuggestions(false);
                            setSuggestions([]);
                            setSelectedSuggestions(new Set());
                          }}
                          style={{ '--border-radius': '12px', fontWeight: 600 }}
                        >
                          添加 {selectedSuggestions.size} 个目标
                        </IonButton>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <IonList
                  style={{
                    background: 'transparent',
                    borderRadius: '16px',
                    padding: 0
                  }}
                >
                  {timeGoals.map((goal, index) => {
                    const duration = calculateGoalDuration(goal.id!);
                    return (
                      <IonItem
                        key={goal.id}
                        lines={index === timeGoals.length - 1 ? 'none' : 'inset'}
                        style={{
                          '--padding-start': '16px',
                          '--padding-end': '12px',
                          '--inner-padding-end': '0px',
                          '--min-height': '68px',
                          '--border-color': isDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(226, 232, 240, 0.8)',
                          '--background': 'transparent'
                        }}
                      >
                        <IonLabel>
                          <h2
                            style={{
                              fontSize: '16px',
                              fontWeight: 'bold',
                              margin: '0 0 6px 0'
                            }}
                          >
                            {goal.name}
                          </h2>
                          <p
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: '#1476ff',
                              margin: 0
                            }}
                          >
                            {formatDuration(duration)}
                          </p>
                        </IonLabel>
                        <div slot="end" style={{ display: 'flex', gap: '2px' }}>
                          <IonButton
                            fill="clear"
                            size="small"
                            color="medium"
                            onClick={() => handleEditGoal(goal)}
                            style={{
                              '--padding-start': '6px',
                              '--padding-end': '6px',
                              margin: 0,
                              height: '34px'
                            }}
                          >
                            <IonIcon icon={createOutline} style={{ fontSize: '18px' }} />
                          </IonButton>
                          <IonButton
                            fill="clear"
                            size="small"
                            color="danger"
                            onClick={() => handleDeleteGoal(goal)}
                            style={{
                              '--padding-start': '6px',
                              '--padding-end': '6px',
                              margin: 0,
                              height: '34px'
                            }}
                          >
                            <IonIcon icon={trashOutline} style={{ fontSize: '18px' }} />
                          </IonButton>
                        </div>
                      </IonItem>
                    );
                  })}
                </IonList>
              )}
            </IonCardContent>
          </IonCard>

          {/* ── 今日感想 ── */}
          {dayMemos.length > 0 && (
            <IonCard style={{ ...cardStyle, marginTop: '1rem' }}>
              <IonCardContent style={{ paddingBottom: 16 }}>
                <div style={{ marginBottom: '12px' }}>
                  <IonText>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <IonIcon icon={chatbubbleEllipsesOutline} aria-hidden="true" />
                      今日感想 ({dayMemos.length})
                    </h3>
                  </IonText>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dayMemos.map(e => (
                    <div
                      key={e.id}
                      onClick={() => {
                        if (!e.memo) return;
                        navigator.clipboard?.writeText(e.memo);
                        present({ message: '已复制', duration: 1200, position: 'top', color: 'success' });
                      }}
                      title="点击复制"
                      style={{
                        cursor: 'pointer',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.9)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{
                        fontSize: '14px',
                        lineHeight: 1.5,
                        color: isDark ? '#e2e8f0' : '#1e293b',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {e.memo}
                      </div>
                      <div style={{
                        marginTop: '4px',
                        fontSize: '12px',
                        color: isDark ? '#64748b' : '#94a3b8',
                      }}>
                        {dayjs(e.startTime).format('HH:mm')} · {e.activity}
                      </div>
                    </div>
                  ))}
                </div>
              </IonCardContent>
            </IonCard>
          )}

          {/* ── 打卡 / 提醒 (check 型) ── */}
          {checkGoals.length > 0 && (
            <IonCard style={{ ...cardStyle, marginTop: '1rem' }}>
              <IonCardContent style={{ paddingBottom: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}
                >
                  <IonText>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                      提醒
                    </h3>
                  </IonText>
                  <IonText color="medium" style={{ fontSize: '13px', fontWeight: 600 }}>
                    已完成 {completedCheckCount} / {checkGoals.length}
                  </IonText>
                </div>

                <IonList
                  style={{ background: 'transparent', borderRadius: '16px', padding: 0 }}
                >
                  {checkGoals.map((goal, index) => {
                    const isDone = !!goal.completed;
                    return (
                      <IonItem
                        key={goal.id}
                        lines={index === checkGoals.length - 1 ? 'none' : 'inset'}
                        button
                        detail={false}
                        onClick={() => toggleCompletion(goal.id!)}
                        style={{
                          '--padding-start': '16px',
                          '--padding-end': '12px',
                          '--inner-padding-end': '0px',
                          '--min-height': '56px',
                          '--border-color': isDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(226, 232, 240, 0.8)',
                          '--background': 'transparent'
                        }}
                      >
                        <IonIcon
                          slot="start"
                          icon={isDone ? checkmarkCircle : ellipseOutline}
                          style={{
                            fontSize: '22px',
                            color: isDone ? '#22c55e' : (isDark ? '#64748b' : '#94a3b8'),
                            marginInlineEnd: '12px'
                          }}
                        />
                        <IonLabel>
                          <h2
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              margin: 0,
                              color: isDone
                                ? (isDark ? '#64748b' : '#94a3b8')
                                : (isDark ? '#f1f5f9' : '#0f172a'),
                              textDecoration: isDone ? 'line-through' : 'none'
                            }}
                          >
                            {goal.name}
                          </h2>
                        </IonLabel>
                        <div slot="end" style={{ display: 'flex', gap: '2px' }}>
                          <IonButton
                            fill="clear"
                            size="small"
                            color="medium"
                            onClick={(e) => { e.stopPropagation(); handleEditGoal(goal); }}
                            style={{
                              '--padding-start': '6px',
                              '--padding-end': '6px',
                              margin: 0,
                              height: '34px'
                            }}
                          >
                            <IonIcon icon={createOutline} style={{ fontSize: '18px' }} />
                          </IonButton>
                          <IonButton
                            fill="clear"
                            size="small"
                            color="danger"
                            onClick={(e) => { e.stopPropagation(); handleDeleteGoal(goal); }}
                            style={{
                              '--padding-start': '6px',
                              '--padding-end': '6px',
                              margin: 0,
                              height: '34px'
                            }}
                          >
                            <IonIcon icon={trashOutline} style={{ fontSize: '18px' }} />
                          </IonButton>
                        </div>
                      </IonItem>
                    );
                  })}
                </IonList>
              </IonCardContent>
            </IonCard>
          )}
        </div>

        {/* ── Right: 日历矩阵 (desktop only, always visible) ── */}
        {isDesktop && (
          <div className="goal-manager-right">
            <IonCard style={cardStyle}>
              <IonCardContent style={{ padding: '10px 12px' }}>
                {backToTodayButton}
                {matrixContent}
              </IonCardContent>
            </IonCard>
          </div>
        )}
      </div>  {/* end goal-manager-body */}

      {/* 添加目标弹窗 (Ionic Sheet Modal) */}
      <IonModal
        isOpen={showAddGoal}
        onDidDismiss={() => { setShowAddGoal(false); setNewGoalType('time'); setNewGoalName(''); }}
        // balanced height to keep button visible above keyboard
        initialBreakpoint={modalBreakpoint}
        breakpoints={[0, modalBreakpoint]}
        style={{ '--border-radius': '24px' }}
        onDidPresent={() => {
          setTimeout(() => {
            addInputRef.current?.setFocus();
          }, 150);
        }}
      >
        <IonContent className="ion-padding" style={{ '--padding-top': '16px', '--padding-bottom': '2px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <IonSegment
              value={newGoalType}
              onIonChange={e => setNewGoalType((e.detail.value as 'time' | 'check') || 'time')}
              style={{
                '--background': isDark ? '#1e293b' : '#f1f5f9',
                borderRadius: '12px',
                marginBottom: '4px'
              } as React.CSSProperties}
            >
              <IonSegmentButton value="time">
                <IonLabel style={{ fontSize: '13px', fontWeight: 600 }}>时间型</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="check">
                <IonLabel style={{ fontSize: '13px', fontWeight: 600 }}>打卡型</IonLabel>
              </IonSegmentButton>
            </IonSegment>
            <div style={{ position: 'relative' }}>
              <IonInput
                ref={addInputRef}
                value={newGoalName}
                placeholder={newGoalType === 'check' ? '例如：吃药、早点睡、喝水' : '输入目标名称'}
                onIonInput={e => setNewGoalName(e.detail.value!)}
                clearInput
                style={{
                  fontSize: '1.125rem',
                  '--background': isDark ? '#1e293b' : '#f8fafc',
                  '--color': isDark ? '#f1f5f9' : '#0f172a',
                  '--border-radius': '16px',
                  '--padding-start': '20px',
                  '--padding-end': '20px',
                  '--padding-top': '16px',
                  '--padding-bottom': '16px',
                  '--placeholder-color': '#94a3b8',
                  '--highlight-height': '0px',
                } as React.CSSProperties}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddGoal();
                  }
                }}
              ></IonInput>
            </div>

            <IonButton
              expand="block"
              onClick={handleAddGoal}
              style={{
                '--border-radius': '16px',
                '--box-shadow': 'none',
                '--padding-top': '12px',
                '--padding-bottom': '12px',
                fontSize: '17px',
                fontWeight: '600'
              }}
            >
              确认添加
            </IonButton>
          </div>
        </IonContent>
      </IonModal>

      {/* 编辑目标弹窗 (Ionic Sheet Modal) */}
      <IonModal
        isOpen={showEditGoal}
        onDidDismiss={() => {
          setShowEditGoal(false);
          setEditingGoal(null);
          setEditGoalName('');
        }}
        // balanced height to keep button visible above keyboard
        initialBreakpoint={modalBreakpoint}
        breakpoints={[0, modalBreakpoint]}
        style={{ '--border-radius': '24px' }}
        onDidPresent={() => {
          setTimeout(() => {
            editInputRef.current?.setFocus();
          }, 150);
        }}
      >
        <IonContent className="ion-padding" style={{ '--padding-top': '16px', '--padding-bottom': '2px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <IonInput
                ref={editInputRef}
                value={editGoalName}
                placeholder="输入目标名称"
                onIonInput={e => setEditGoalName(e.detail.value!)}
                clearInput
                style={{
                  fontSize: '1.125rem',
                  '--background': isDark ? '#1e293b' : '#f8fafc',
                  '--color': isDark ? '#f1f5f9' : '#0f172a',
                  '--border-radius': '16px',
                  '--padding-start': '20px',
                  '--padding-end': '20px',
                  '--padding-top': '16px',
                  '--padding-bottom': '16px',
                  '--placeholder-color': '#94a3b8',
                  '--highlight-height': '0px'
                } as React.CSSProperties}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit();
                  }
                }}
              ></IonInput>
            </div>

            <IonButton
              expand="block"
              onClick={handleSaveEdit}
              style={{
                '--border-radius': '16px',
                '--box-shadow': 'none',
                '--padding-top': '12px',
                '--padding-bottom': '12px',
                fontSize: '17px',
                fontWeight: '600'
              }}
            >
              保存修改
            </IonButton>
          </div>
        </IonContent>
      </IonModal>
    </div>
  );
};
