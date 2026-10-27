import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useEntryStore } from '../../stores/entryStore';
import { useCategoryStore } from '../../stores/categoryStore';
import { useGoalStore } from '../../stores/goalStore';
import type { TimeEntry } from '../../services/db';
import dayjs from 'dayjs';
import { IonIcon, IonModal } from '@ionic/react';
import { alertCircleOutline } from 'ionicons/icons';
import { WheelMonthYearPicker } from '../common/WheelTimePicker';
import { useDarkMode } from '../../hooks/useDarkMode';
import {
  calculateDailyCoverage,
  calculateMonthlyDailyCoverage,
  calculateWeeklyCoverage,
} from '../../services/weeklyCoverage';
import { CoverageCalendar } from './CoverageCalendar';
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
  animatedEntryId?: string | null;
  overlapCount?: number;
}

const getDatePickerModalStyle = (isIOS: boolean): React.CSSProperties => ({
  '--height': 'auto',
  '--width': '100%',
  '--border-radius': isIOS ? '28px 28px 0 0' : '16px 16px 0 0',
  '--background': 'hsl(var(--card))',
  '--box-shadow': 'none',
  alignItems: 'flex-end',
} as React.CSSProperties);

const getDatePickerContentStyle = (): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
  paddingBottom: 'calc(16px + var(--ion-safe-area-bottom, 0px))',
  background: 'hsl(var(--card))',
  color: 'hsl(var(--foreground))',
});


export const TimelineView: React.FC<TimelineViewProps> = ({
  selectedDate,
  onDateChange,
  animatedEntryId = null,
  overlapCount = 0,
}) => {
  const { entries, loadEntries, setNextStartTime, setTimeRange, getEarliestEntryDate } = useEntryStore();
  const { loadCategories, getCategoryColor } = useCategoryStore();
  const { goals, loadGoals } = useGoalStore();
  const isIOS = Capacitor.getPlatform() === 'ios';
  const earliestDate = getEarliestEntryDate();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [gapBlocks, setGapBlocks] = useState<GapBlock[]>([]);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [showMonthWheel, setShowMonthWheel] = useState(false);
  const [viewYear, setViewYear] = useState(() => dayjs(selectedDate).year());
  const [viewMonth, setViewMonth] = useState(() => dayjs(selectedDate).month() + 1);
  const [tooltip, setTooltip] = useState<{ block: TimeBlock; positionPercent: number } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useDarkMode();
  const currentMonthDate = useMemo(
    () => dayjs(`${viewYear}-${String(viewMonth).padStart(2, '0')}-01`),
    [viewYear, viewMonth]
  );
  const earliestSelectableDate = useMemo(
    () => (earliestDate ? dayjs(earliestDate) : null),
    [earliestDate]
  );
  const canGoPrevMonth = useMemo(() => {
    if (!earliestSelectableDate) return true;
    return currentMonthDate.isAfter(earliestSelectableDate, 'month');
  }, [currentMonthDate, earliestSelectableDate]);
  const canGoNextMonth = currentMonthDate.isBefore(dayjs(), 'month');

  // Initialize all picker state from selectedDate when opening
  const openDatePicker = () => {
    const d = dayjs(selectedDate);
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

    setViewYear(parsed.year());
    setViewMonth(parsed.month() + 1);
    onDateChange(parsed.toDate());
    closeDatePicker();
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
    const diff = dayjs(time).diff(dayjs(dayStart), 'millisecond');
    return (diff / (24 * 60 * 60 * 1000)) * 100;
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

  const earliestDayJs = earliestDate ? dayjs(earliestDate) : null;
  const isEarliestDay = earliestDayJs
    ? dayjs(selectedDate).isSame(earliestDayJs, 'day') || dayjs(selectedDate).isBefore(earliestDayJs, 'day')
    : false;

  const isToday = dayjs(selectedDate).isSame(dayjs(), 'day');
  const selectedDateLabel = dayjs(selectedDate).format('YYYY-MM-DD');
  const compactSelectedDateLabel = dayjs(selectedDate).format('MM-DD');

  const weeklyCoverage = useMemo(
    () => calculateWeeklyCoverage(entries, selectedDate, new Date(nowTick)),
    [entries, selectedDate, nowTick]
  );
  const dailyCoverage = useMemo(
    () => calculateDailyCoverage(entries, selectedDate, new Date(nowTick)),
    [entries, selectedDate, nowTick]
  );
  // 日历每天的圆环与上面的当日覆盖率同一口径；只在日历打开时计算
  const monthlyCoverage = useMemo(
    () => (datePickerVisible
      ? calculateMonthlyDailyCoverage(entries, currentMonthDate.toDate(), new Date(nowTick))
      : new Map<string, number>()),
    [datePickerVisible, entries, currentMonthDate, nowTick]
  );
  const currentTimeAnimationDuration = Math.max(
    1_000,
    dayjs(new Date(nowTick)).endOf('day').valueOf() - nowTick
  );

  const refreshNow = useCallback(() => setNowTick(Date.now()), []);

  // 每分钟校准一次。不能用 isCurrentWeek 做开关：它由 nowTick 自身算出，
  // 周日计时跨夜、周一停止（自动切到今天）时 nowTick 还是旧值，定时器会被永久关掉。
  useEffect(() => {
    const id = setInterval(refreshNow, 60_000);
    return () => clearInterval(id);
  }, [refreshNow]);

  // 切换日期（含跨午夜停止计时自动切到今天）时立即校准，避免先画出陈旧位置。
  useLayoutEffect(() => {
    refreshNow();
  }, [selectedDate, refreshNow]);

  // 回到前台（切回 App / 解锁 / 窗口重新聚焦）时立即校准：后台期间定时器和 CSS 动画都可能停摆。
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshNow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshNow);
    };
  }, [refreshNow]);

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
      {/* 日期导航 + 所选日期所在周的记录覆盖率 */}
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
            <time
              className="timeline-date-label"
              dateTime={selectedDateLabel}
              aria-label={selectedDateLabel}
            >
              <span className="timeline-date-label-full" aria-hidden="true">
                {selectedDateLabel}
              </span>
              <span className="timeline-date-label-compact" aria-hidden="true">
                {compactSelectedDateLabel}
              </span>
            </time>
            {overlapCount > 0 && (
              <span
                className="timeline-overlap-warning"
                title={`当天存在 ${overlapCount} 组时间重叠`}
                role="img"
                aria-label={`当天存在 ${overlapCount} 组时间重叠`}
              >
                <IonIcon icon={alertCircleOutline} aria-hidden="true" />
              </span>
            )}
            {!isToday && (
              <button
                onClick={(e) => { e.stopPropagation(); goToToday(); }}
                className="today-btn"
                aria-label="回到今天"
              >
                <span className="today-label-default" aria-hidden="true">今天</span>
                <span className="today-label-compact" aria-hidden="true">今</span>
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

        <div
          className="timeline-week-coverage"
          title={`${weeklyCoverage.isCurrentWeek ? '本周' : '当周'}时间记录覆盖率 ${weeklyCoverage.percentage}%`}
        >
          <span className="timeline-week-coverage-label">
            {weeklyCoverage.isCurrentWeek ? '本周' : '当周'}
          </span>
          <div
            className="timeline-week-coverage-track"
            role="progressbar"
            aria-label={`${weeklyCoverage.isCurrentWeek ? '本周' : '当周'}时间记录覆盖率`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={weeklyCoverage.percentage}
          >
            <div
              className="timeline-week-coverage-fill"
              style={{ width: `${weeklyCoverage.percentage}%` }}
            />
          </div>
          <strong className="timeline-week-coverage-value">{weeklyCoverage.percentage}%</strong>
        </div>
      </div>

      <IonModal
        className="timeline-date-modal"
        isOpen={datePickerVisible}
        onDidDismiss={closeDatePicker}
        style={getDatePickerModalStyle(isIOS)}
      >
        <div style={getDatePickerContentStyle()}>
          {/* iOS 保留原有的「取消 / 今天」操作行 */}
          {isIOS && (
            <div
              style={{
                width: '100%',
                maxWidth: '400px',
                margin: '0 auto 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
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
          )}
          {showMonthWheel ? (
            /* ── Year / Month wheel view ── */
            <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto', minHeight: '344px', display: 'flex', flexDirection: 'column' }}>
              {/* Back → calendar button */}
              <button
                onClick={() => setShowMonthWheel(false)}
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
            /* ── Calendar view：每天外圈按记录覆盖率画弧 ── */
            <CoverageCalendar
              month={currentMonthDate.toDate()}
              selectedDate={selectedDate}
              coverageByDate={monthlyCoverage}
              minDate={earliestDate}
              canGoPrevMonth={canGoPrevMonth}
              canGoNextMonth={canGoNextMonth}
              onMonthStep={(delta) => (delta === 1 ? goToNextMonth() : goToPreviousMonth())}
              onSelectDate={handleDateSelect}
              onTitleClick={() => setShowMonthWheel(true)}
            />
          )}
        </div>
      </IonModal>

      {/* 时间轴 */}
      <div className="timeline-day-row">
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
                className={`timeline-block${block.id === animatedEntryId ? ' is-new-entry' : ''}`}
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

          {/* 当前时间指示线：CSS 持续移动，每分钟用 nowTick 校准一次 */}
          {isToday && (
            <div
              key={nowTick}
              className="timeline-current-time"
              style={{
                left: `${getTimePercent(new Date(nowTick), dayjs().startOf('day').toDate())}%`,
                animationDuration: `${currentTimeAnimationDuration}ms`,
              }}
            />
          )}

          {/* Tooltip — 出现在时间轴下方，不会被裁切 */}
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
        <strong
          className="timeline-day-coverage-value"
          title={`${dailyCoverage.isToday ? '今日' : '当日'}时间记录覆盖率 ${dailyCoverage.percentage}%`}
        >
          {dailyCoverage.percentage}%
        </strong>
      </div>
    </div>
  );
};
