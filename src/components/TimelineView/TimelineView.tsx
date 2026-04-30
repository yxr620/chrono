import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useEntryStore } from '../../stores/entryStore';
import { useCategoryStore } from '../../stores/categoryStore';
import { useGoalStore } from '../../stores/goalStore';
import type { TimeEntry } from '../../services/db';
import dayjs from 'dayjs';
import { IonDatetime, IonModal, IonContent } from '@ionic/react';
import { WheelMonthYearPicker } from '../common/WheelTimePicker';
import { useDarkMode } from '../../hooks/useDarkMode';
import './TimelineView.css';

interface TimeBlock {
  id: string;
  startPercent: number;
  widthPercent: number;
  color: string;
  entry: TimeEntry;
  label: string;
}

interface GapBlock {
  id: string;
  startPercent: number;
  widthPercent: number;
  startTime: Date;
  endTime: Date;
}

interface TimelineViewProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];


export const TimelineView: React.FC<TimelineViewProps> = ({ selectedDate, onDateChange }) => {
  const { entries, loadEntries, setNextStartTime, setTimeRange, getEarliestEntryDate } = useEntryStore();
  const { loadCategories, getCategoryColor } = useCategoryStore();
  const { goals, loadGoals } = useGoalStore();
  const isIOS = Capacitor.getPlatform() === 'ios';
  const earliestDate = getEarliestEntryDate();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [gapBlocks, setGapBlocks] = useState<GapBlock[]>([]);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [showMonthWheel, setShowMonthWheel] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => dayjs(selectedDate).format('YYYY-MM-DD'));
  const [viewYear, setViewYear] = useState(() => dayjs(selectedDate).year());
  const [viewMonth, setViewMonth] = useState(() => dayjs(selectedDate).month() + 1);
  const [tooltip, setTooltip] = useState<{ block: TimeBlock; positionPercent: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const datetimeRef = useRef<HTMLIonDatetimeElement>(null);
  const { isDark } = useDarkMode();
  const currentMonthDate = useMemo(
    () => dayjs(`${viewYear}-${String(viewMonth).padStart(2, '0')}-01`),
    [viewYear, viewMonth]
  );
  const earliestSelectableDate = useMemo(
    () => (earliestDate ? dayjs(earliestDate) : null),
    [earliestDate]
  );
  const calendarDays = useMemo(() => {
    const daysInMonth = currentMonthDate.daysInMonth();
    const firstDayOfWeek = (currentMonthDate.day() + 6) % 7;
    const days: (string | null)[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(currentMonthDate.date(day).format('YYYY-MM-DD'));
    }

    return days;
  }, [currentMonthDate]);
  const canGoPrevMonth = useMemo(() => {
    if (!earliestSelectableDate) return true;
    return currentMonthDate.isAfter(earliestSelectableDate, 'month');
  }, [currentMonthDate, earliestSelectableDate]);
  const canGoNextMonth = currentMonthDate.isBefore(dayjs(), 'month');
  const monthTitle = currentMonthDate.format('YYYY年M月');

  // Initialize all picker state from selectedDate when opening
  const openDatePicker = () => {
    const d = dayjs(selectedDate);
    setCalendarDate(d.format('YYYY-MM-DD'));
    setViewYear(d.year());
    setViewMonth(d.month() + 1);
    setShowMonthWheel(false);
    setDatePickerVisible(true);
  };

  const closeDatePicker = () => {
    setDatePickerVisible(false);
    setShowMonthWheel(false);
  };

  const handleDateSelect = (value: string | Date) => {
    const parsed = dayjs(value);
    if (!parsed.isValid()) return;

    setCalendarDate(parsed.format('YYYY-MM-DD'));
    setViewYear(parsed.year());
    setViewMonth(parsed.month() + 1);
    onDateChange(parsed.toDate());
    closeDatePicker();
  };

  const handleCalendarChange = (value: string | string[] | null | undefined) => {
    if (!value) return;

    const dateStr = Array.isArray(value) ? value[0] : value;
    handleDateSelect(dateStr);
  };

  const goToPreviousMonth = () => {
    if (!canGoPrevMonth) return;
    const prevMonth = currentMonthDate.subtract(1, 'month');
    setViewYear(prevMonth.year());
    setViewMonth(prevMonth.month() + 1);
  };

  const goToNextMonth = () => {
    if (!canGoNextMonth) return;
    const nextMonth = currentMonthDate.add(1, 'month');
    setViewYear(nextMonth.year());
    setViewMonth(nextMonth.month() + 1);
  };

  // Intercept Ionic's built-in month-year-button click (shadow DOM)
  // and replace it with our custom wheel picker
  useEffect(() => {
    if (isIOS || !datePickerVisible || showMonthWheel) return;

    let cleanup: (() => void) | undefined;

    const attach = () => {
      const shadow = datetimeRef.current?.shadowRoot;
      if (!shadow) return false;
      const btn = shadow.querySelector('[part="month-year-button"]') as HTMLElement | null;
      if (!btn) return false;

      const onBtnClick = (e: Event) => {
        e.stopImmediatePropagation(); // prevent Ionic's internal month-year picker
        const d = dayjs(calendarDate);
        setViewYear(d.year());
        setViewMonth(d.month() + 1);
        setShowMonthWheel(true);
      };

      btn.addEventListener('click', onBtnClick, { capture: true });
      cleanup = () => btn.removeEventListener('click', onBtnClick, { capture: true });
      return true;
    };

    if (!attach()) {
      const timer = setTimeout(attach, 250);
      return () => { clearTimeout(timer); cleanup?.(); };
    }
    return () => cleanup?.();
  }, [isIOS, datePickerVisible, showMonthWheel, calendarDate]);

  useEffect(() => {
    loadEntries();
    loadCategories();
    loadGoals();
  }, [loadEntries, loadCategories, loadGoals]);

  // 点击外部关闭 tooltip
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltip && containerRef.current) {
        const target = e.target as HTMLElement;
        if (!containerRef.current.contains(target)) {
          setTooltip(null);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [tooltip]);

  const getTimePercent = (time: Date, dayStart: Date): number => {
    const diff = dayjs(time).diff(dayjs(dayStart), 'minute');
    return (diff / (24 * 60)) * 100;
  };

  const processTimelineData = useCallback(() => {
    const dayStart = dayjs(selectedDate).startOf('day').toDate();
    const dayEnd = dayjs(selectedDate).endOf('day').toDate();

    const relevantEntries = entries.filter(entry => {
      if (!entry.endTime) return false;
      const entryStart = dayjs(entry.startTime);
      const entryEnd = dayjs(entry.endTime);
      return entryStart.isBefore(dayEnd) && entryEnd.isAfter(dayStart);
    });

    const sortedEntries = relevantEntries.sort((a, b) =>
      dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()
    );

    const blocks: TimeBlock[] = [];

    sortedEntries.forEach(entry => {
      if (!entry.endTime) return;

      const entryStart = dayjs(entry.startTime);
      const entryEnd = dayjs(entry.endTime);
      const start = entryStart.isBefore(dayStart) ? dayjs(dayStart) : entryStart;
      const end = entryEnd.isAfter(dayEnd) ? dayjs(dayEnd) : entryEnd;

      const startPercent = getTimePercent(start.toDate(), dayStart);
      const endPercent = getTimePercent(end.toDate(), dayStart);
      const widthPercent = endPercent - startPercent;

      const color = getCategoryColor(entry.categoryId);
      const goal = goals.find(g => g.id === entry.goalId);
      const goalText = goal ? ` [${goal.name}]` : '';

      blocks.push({
        id: entry.id!,
        startPercent,
        widthPercent,
        color,
        entry,
        label: `${entry.activity}${goalText}`
      });
    });

    setTimeBlocks(blocks);

    const gaps: GapBlock[] = [];

    if (blocks.length > 0) {
      if (blocks[0].startPercent > 0) {
        gaps.push({
          id: 'gap-start',
          startPercent: 0,
          widthPercent: blocks[0].startPercent,
          startTime: dayStart,
          endTime: dayjs(blocks[0].entry.startTime).isBefore(dayStart)
            ? dayStart
            : blocks[0].entry.startTime
        });
      }

      for (let i = 0; i < blocks.length - 1; i++) {
        const cur = blocks[i];
        const next = blocks[i + 1];
        const gapStart = cur.startPercent + cur.widthPercent;
        const gapWidth = next.startPercent - gapStart;

        if (gapWidth > 0.1) {
          const gapStartTime = dayjs(cur.entry.endTime!).isAfter(dayEnd)
            ? dayEnd
            : cur.entry.endTime!;
          const gapEndTime = dayjs(next.entry.startTime).isBefore(dayStart)
            ? dayStart
            : next.entry.startTime;

          gaps.push({
            id: `gap-${i}`,
            startPercent: gapStart,
            widthPercent: gapWidth,
            startTime: gapStartTime,
            endTime: gapEndTime
          });
        }
      }

      const last = blocks[blocks.length - 1];
      const lastEnd = last.startPercent + last.widthPercent;
      if (lastEnd < 100) {
        gaps.push({
          id: 'gap-end',
          startPercent: lastEnd,
          widthPercent: 100 - lastEnd,
          startTime: dayjs(last.entry.endTime!).isAfter(dayEnd) ? dayEnd : last.entry.endTime!,
          endTime: dayEnd
        });
      }
    } else {
      gaps.push({
        id: 'gap-full-day',
        startPercent: 0,
        widthPercent: 100,
        startTime: dayStart,
        endTime: dayEnd
      });
    }

    setGapBlocks(gaps);
  }, [entries, selectedDate, goals, getCategoryColor]);

  useEffect(() => {
    processTimelineData();
  }, [processTimelineData]);

  const formatDuration = (start: Date, end: Date | null) => {
    if (!end) return '进行中';
    const diff = dayjs(end).diff(dayjs(start), 'minute');
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const totalHours = Math.round(
    timeBlocks.reduce((sum, b) => {
      return sum + dayjs(b.entry.endTime).diff(dayjs(b.entry.startTime), 'minute');
    }, 0) / 60 * 10
  ) / 10;

  const timeLabels = [0, 6, 12, 18, 24];

  const earliestDayJs = earliestDate ? dayjs(earliestDate) : null;
  const isEarliestDay = earliestDayJs
    ? dayjs(selectedDate).isSame(earliestDayJs, 'day') || dayjs(selectedDate).isBefore(earliestDayJs, 'day')
    : false;

  const isToday = dayjs(selectedDate).isSame(dayjs(), 'day');

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const goToPreviousDay = () => {
    if (isEarliestDay) return;
    onDateChange(dayjs(selectedDate).subtract(1, 'day').toDate());
  };

  const goToNextDay = () => {
    onDateChange(dayjs(selectedDate).add(1, 'day').toDate());
  };

  const goToToday = () => {
    handleDateSelect(new Date());
  };

  return (
    <div className="timeline-view">
      {/* 日期导航 + 统计信息：合并一行 */}
      <div className="timeline-header">
        <div className="timeline-header-left">
          <button
            onClick={goToPreviousDay}
            className="date-nav-btn date-nav-btn-prev"
            disabled={isEarliestDay}
            aria-label="上一天"
          >
            <span className="date-nav-glyph">‹</span>
          </button>
          <div
            className="date-display date-display-clickable"
            onClick={openDatePicker}
          >
            {dayjs(selectedDate).format('YYYY-MM-DD')}
            {!isToday && (
              <button
                onClick={(e) => { e.stopPropagation(); goToToday(); }}
                className="today-btn"
              >
                今天
              </button>
            )}
          </div>
          <button
            onClick={goToNextDay}
            className="date-nav-btn date-nav-btn-next"
            disabled={isToday}
            aria-label="下一天"
          >
            <span className="date-nav-glyph">›</span>
          </button>
        </div>

        <div className="timeline-header-stats">
          <span>{timeBlocks.length} 项</span>
          <span className="stat-sep">·</span>
          <span>{totalHours}h</span>
        </div>
      </div>

      <IonModal
        isOpen={datePickerVisible}
        onDidDismiss={closeDatePicker}
        initialBreakpoint={isIOS ? 0.62 : 0.55}
        breakpoints={isIOS ? [0, 0.62] : [0, 0.55, 0.7]}
        handle={!isIOS}
        style={isIOS ? ({ '--border-radius': '28px' } as React.CSSProperties) : undefined}
      >
        <IonContent className="ion-padding">
          {isIOS ? (
            <div style={{ maxWidth: '380px', margin: '0 auto', paddingBottom: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px'
                }}
              >
                <button
                  onClick={closeDatePicker}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isDark ? '#94a3b8' : '#64748b',
                    fontSize: '14px',
                    fontWeight: 600,
                    padding: 0
                  }}
                >
                  取消
                </button>
                <span style={{ fontSize: '15px', fontWeight: 700, color: isDark ? '#e2e8f0' : '#334155' }}>
                  快速选择日期
                </span>
                <button
                  onClick={goToToday}
                  disabled={isToday}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isToday ? (isDark ? '#475569' : '#cbd5e1') : '#3b82f6',
                    fontSize: '14px',
                    fontWeight: 600,
                    padding: 0,
                    opacity: isToday ? 0.55 : 1
                  }}
                >
                  今天
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px'
                }}
              >
                <button
                  onClick={goToPreviousMonth}
                  disabled={!canGoPrevMonth}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isDark ? '#94a3b8' : '#64748b',
                    fontSize: '18px',
                    padding: '4px 6px',
                    opacity: canGoPrevMonth ? 1 : 0.25
                  }}
                  aria-label="上个月"
                >
                  ‹
                </button>
                <span style={{ fontSize: '14px', fontWeight: 700, color: isDark ? '#e2e8f0' : '#334155' }}>
                  {monthTitle}
                </span>
                <button
                  onClick={goToNextMonth}
                  disabled={!canGoNextMonth}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isDark ? '#94a3b8' : '#64748b',
                    fontSize: '18px',
                    padding: '4px 6px',
                    opacity: canGoNextMonth ? 1 : 0.25
                  }}
                  aria-label="下个月"
                >
                  ›
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '6px' }}>
                {WEEKDAYS.map((weekday) => (
                  <div
                    key={weekday}
                    style={{
                      textAlign: 'center',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: isDark ? '#64748b' : '#94a3b8',
                      lineHeight: '16px'
                    }}
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {calendarDays.map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} />;
                  }

                  const dateValue = dayjs(date);
                  const isTodayCell = dateValue.isSame(dayjs(), 'day');
                  const isSelected = dateValue.isSame(dayjs(selectedDate), 'day');
                  const isBeforeEarliest = earliestSelectableDate ? dateValue.isBefore(earliestSelectableDate, 'day') : false;
                  const isFuture = dateValue.isAfter(dayjs(), 'day');
                  const isDisabled = isBeforeEarliest || isFuture;

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleDateSelect(date)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: '6px',
                        border: isSelected
                          ? '1px solid #3b82f6'
                          : `1px solid ${isDark ? 'rgba(71, 85, 105, 0.32)' : 'rgba(203, 213, 225, 0.9)'}`,
                        background: isSelected
                          ? (isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.1)')
                          : (isDark ? 'rgba(30, 41, 59, 0.55)' : '#ffffff'),
                        color: isSelected
                          ? '#3b82f6'
                          : isDisabled
                            ? (isDark ? '#334155' : '#cbd5e1')
                            : (isDark ? '#e2e8f0' : '#334155'),
                        fontSize: '12px',
                        fontWeight: isSelected || isTodayCell ? 700 : 500,
                        opacity: isDisabled ? 0.45 : 1,
                        outline: isTodayCell && !isSelected ? `1px solid ${isDark ? '#60a5fa' : '#93c5fd'}` : 'none',
                        outlineOffset: '-2px',
                        padding: 0,
                        minHeight: '36px'
                      }}
                    >
                      {dateValue.date()}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : showMonthWheel ? (
            /* ── Year / Month wheel view ── */
            <div>
              {/* Back → calendar button */}
              <button
                onClick={() => {
                  const d = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
                  setCalendarDate(d);
                  setShowMonthWheel(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#60a5fa' : '#3b82f6',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 0 12px',
                }}
              >
                ‹ {viewYear}年{viewMonth}月
              </button>
              <WheelMonthYearPicker
                year={viewYear}
                month={viewMonth}
                min={earliestDate || undefined}
                max={dayjs().format('YYYY-MM-DD')}
                isDark={isDark}
                onChange={(y, m) => { setViewYear(y); setViewMonth(m); }}
              />
            </div>
          ) : (
            /* ── Calendar view (original IonDatetime) ── */
            <IonDatetime
              ref={datetimeRef}
              presentation="date"
              value={calendarDate}
              min={earliestDate || undefined}
              max={dayjs().format('YYYY-MM-DD')}
              locale="zh-CN"
              firstDayOfWeek={1}
              onIonChange={(e) => handleCalendarChange(e.detail.value)}
              style={{ width: '100%', margin: '0 auto' }}
            />
          )}
        </IonContent>
      </IonModal>

      {/* 时间轴 */}
      <div
        ref={containerRef}
        className="timeline-container"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('.timeline-block')) {
            setTooltip(null);
          }
        }}
      >
        {/* 时间轴条 */}
        <div className="timeline-bar">
          {gapBlocks.map((gap) => (
            <div
              key={gap.id}
              className="timeline-gap-block"
              style={{ left: `${gap.startPercent}%`, width: `${gap.widthPercent}%` }}
              onClick={() => setTimeRange(gap.startTime, gap.endTime)}
              title={`${dayjs(gap.startTime).format('HH:mm')} - ${dayjs(gap.endTime).format('HH:mm')}`}
            />
          ))}

          {timeBlocks.map((block) => (
            <div
              key={block.id}
              className="timeline-block"
              style={{
                left: `${block.startPercent}%`,
                width: `${block.widthPercent}%`,
                backgroundColor: block.color
              }}
              title={block.label}
              onClick={() => {
                const centerPercent = block.startPercent + block.widthPercent / 2;
                setTooltip({ block, positionPercent: centerPercent });
                if (block.entry.endTime) {
                  setNextStartTime(block.entry.endTime);
                }
              }}
            />
          ))}

        </div>

        {/* 当前时间指示线 — 覆盖在 bar+labels 上，不受 bar overflow:hidden 约束 */}
        {isToday && (
          <div
            className="timeline-current-time"
            style={{ left: `${getTimePercent(new Date(nowTick), dayjs().startOf('day').toDate())}%` }}
          />
        )}

        {/* 时间刻度 — bar 下方 */}
        <div className="timeline-labels">
          {timeLabels.map(hour => (
            <div
              key={hour}
              className={`timeline-label ${hour === 0 ? 'timeline-label-start' : hour === 24 ? 'timeline-label-end' : ''}`}
              style={{ left: `${(hour / 24) * 100}%` }}
            >
              {hour}
            </div>
          ))}
        </div>

        {/* Tooltip — 出现在 labels 下方，不会被裁切 */}
        <div className="timeline-tooltip-area">
          {tooltip && (
            <div
              className={`timeline-tooltip ${
                tooltip.positionPercent < 15 ? 'tooltip-align-left' :
                tooltip.positionPercent > 85 ? 'tooltip-align-right' : ''
              }`}
              style={{ left: `${Math.max(5, Math.min(95, tooltip.positionPercent))}%` }}
            >
              <div className="tooltip-activity">{tooltip.block.entry.activity}</div>
              <div className="tooltip-time">
                {dayjs(tooltip.block.entry.startTime).format('HH:mm')} –{' '}
                {dayjs(tooltip.block.entry.endTime).format('HH:mm')}{' '}
                ({formatDuration(tooltip.block.entry.startTime, tooltip.block.entry.endTime)})
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
