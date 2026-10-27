import React, { useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { IonIcon } from '@ionic/react';
import { caretDownOutline, chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { buildMonthGrid, resolveSwipeMonthDelta } from './coverageCalendarModel';
import './CoverageCalendar.css';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// 手指横向移动超过这个距离才接管为切月拖动，避免和点选日期冲突
const DRAG_START_DISTANCE = 8;
// 已经到头的方向上拖动只跟手一小段，提示「没有更多月份」
const EDGE_DRAG_RESISTANCE = 0.25;
// 触控板一次横扫会带一串惯性 wheel 事件，切月后这段时间内的事件都吞掉
const WHEEL_LOCK_MS = 300;
const WHEEL_IDLE_RESET_MS = 200;

type MonthDelta = -1 | 1;

interface CoverageCalendarProps {
  month: Date;
  selectedDate: Date;
  /** YYYY-MM-DD → 当天记录覆盖率（0–100）；没有值的日期不画圆环 */
  coverageByDate: Map<string, number>;
  /** 最早可选日期 YYYY-MM-DD */
  minDate: string | null;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onMonthStep: (delta: MonthDelta) => void;
  onSelectDate: (date: string) => void;
  onTitleClick: () => void;
}

interface DragGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  dragging: boolean;
}

export const CoverageCalendar: React.FC<CoverageCalendarProps> = ({
  month,
  selectedDate,
  coverageByDate,
  minDate,
  canGoPrevMonth,
  canGoNextMonth,
  onMonthStep,
  onSelectDate,
  onTitleClick,
}) => {
  const monthKey = dayjs(month).format('YYYY-MM');
  const cells = useMemo(() => buildMonthGrid(dayjs(`${monthKey}-01`).toDate()), [monthKey]);
  const [slide, setSlide] = useState<{ monthKey: string; direction: 'next' | 'prev' } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragGesture | null>(null);
  const suppressClickRef = useRef(false);
  const wheelRef = useRef({ accX: 0, accY: 0, lastTime: 0, lockedUntil: 0 });

  const canStep = (delta: MonthDelta) => (delta === 1 ? canGoNextMonth : canGoPrevMonth);

  const stepMonth = (delta: MonthDelta) => {
    if (!canStep(delta)) return;
    setSlide({
      monthKey: dayjs(`${monthKey}-01`).add(delta, 'month').format('YYYY-MM'),
      direction: delta === 1 ? 'next' : 'prev',
    });
    onMonthStep(delta);
  };

  const setDragOffset = (dx: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const blocked = (dx < 0 && !canGoNextMonth) || (dx > 0 && !canGoPrevMonth);
    grid.style.transition = 'none';
    grid.style.transform = `translateX(${blocked ? dx * EDGE_DRAG_RESISTANCE : dx}px)`;
  };

  const snapBack = () => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.style.transition = 'transform 0.2s ease';
    grid.style.transform = '';
  };

  // 触屏 / 触控笔：横向拖动跟手，松手按距离或速度决定是否切月
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    if (e.pointerType === 'mouse') return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      dragging: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;

    if (!gesture.dragging) {
      if (Math.abs(dy) >= DRAG_START_DISTANCE && Math.abs(dy) >= Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      if (Math.abs(dx) < DRAG_START_DISTANCE) return;
      gesture.dragging = true;
      // 只在确认是拖动后才捕获指针，否则点按日期的 click 会被转给容器
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    setDragOffset(dx);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!gesture.dragging) return;

    suppressClickRef.current = true;
    const delta = resolveSwipeMonthDelta({
      dx: e.clientX - gesture.startX,
      dy: e.clientY - gesture.startY,
      elapsedMs: e.timeStamp - gesture.startTime,
      width: e.currentTarget.clientWidth,
    });

    if (delta !== 0 && canStep(delta)) {
      stepMonth(delta);
    } else {
      snapBack();
    }
  };

  const handlePointerCancel = () => {
    if (dragRef.current?.dragging) snapBack();
    dragRef.current = null;
  };

  // 拖动结束时浏览器仍可能补发一次 click，不能让它选中手指下的日期
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  // 桌面触控板双指横扫（Electron / 浏览器）
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const wheel = wheelRef.current;
    if (e.timeStamp < wheel.lockedUntil) {
      wheel.lockedUntil = e.timeStamp + WHEEL_LOCK_MS;
      return;
    }
    if (e.timeStamp - wheel.lastTime > WHEEL_IDLE_RESET_MS) {
      wheel.accX = 0;
      wheel.accY = 0;
    }
    wheel.lastTime = e.timeStamp;
    wheel.accX += e.deltaX;
    wheel.accY += e.deltaY;

    const delta = resolveSwipeMonthDelta({
      dx: -wheel.accX,
      dy: wheel.accY,
      elapsedMs: Number.POSITIVE_INFINITY,
      width: e.currentTarget.clientWidth,
    });
    if (delta === 0) return;

    wheel.accX = 0;
    wheel.accY = 0;
    wheel.lockedUntil = e.timeStamp + WHEEL_LOCK_MS;
    stepMonth(delta);
  };

  const today = dayjs();
  const selectedKey = dayjs(selectedDate).format('YYYY-MM-DD');
  const todayKey = today.format('YYYY-MM-DD');
  const slideClass = slide?.monthKey === monthKey ? ` is-sliding-${slide.direction}` : '';

  return (
    <div className="coverage-calendar">
      <div className="coverage-calendar-header">
        <button
          type="button"
          className="coverage-calendar-title"
          onClick={onTitleClick}
          aria-label="选择年月"
        >
          {dayjs(`${monthKey}-01`).format('YYYY年M月')}
          <IonIcon icon={caretDownOutline} aria-hidden="true" />
        </button>
        <div className="coverage-calendar-nav">
          <button
            type="button"
            className="coverage-calendar-nav-btn"
            onClick={() => stepMonth(-1)}
            disabled={!canGoPrevMonth}
            aria-label="上个月"
          >
            <IonIcon icon={chevronBackOutline} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="coverage-calendar-nav-btn"
            onClick={() => stepMonth(1)}
            disabled={!canGoNextMonth}
            aria-label="下个月"
          >
            <IonIcon icon={chevronForwardOutline} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="coverage-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div
        className="coverage-calendar-body"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        onWheel={handleWheel}
      >
        <div key={monthKey} ref={gridRef} className={`coverage-calendar-grid${slideClass}`}>
          {cells.map((date, index) => {
            if (!date) {
              return <span key={`empty-${index}`} className="coverage-calendar-cell" />;
            }

            const isBeforeMin = minDate ? date < minDate : false;
            const isFuture = date > todayKey;
            const isDisabled = isBeforeMin || isFuture;
            const isSelected = date === selectedKey;
            const isToday = date === todayKey;
            const percentage = isDisabled ? undefined : coverageByDate.get(date);
            const dateLabel = dayjs(date).format('M月D日');

            const className = [
              'coverage-calendar-day',
              isSelected && 'is-selected',
              isToday && 'is-today',
            ].filter(Boolean).join(' ');

            return (
              <span key={date} className="coverage-calendar-cell">
                <button
                  type="button"
                  className={className}
                  disabled={isDisabled}
                  onClick={() => onSelectDate(date)}
                  aria-pressed={isSelected}
                  aria-label={percentage === undefined ? dateLabel : `${dateLabel}，已记录 ${percentage}%`}
                >
                  {percentage !== undefined && (
                    <svg className="coverage-calendar-ring" viewBox="0 0 40 40" aria-hidden="true">
                      <circle
                        className="coverage-calendar-ring-track"
                        cx="20"
                        cy="20"
                        r={RING_RADIUS}
                      />
                      {percentage > 0 && (
                        <circle
                          className="coverage-calendar-ring-progress"
                          cx="20"
                          cy="20"
                          r={RING_RADIUS}
                          strokeDasharray={`${(RING_CIRCUMFERENCE * percentage) / 100} ${RING_CIRCUMFERENCE}`}
                        />
                      )}
                    </svg>
                  )}
                  <span className="coverage-calendar-day-number">{Number(date.slice(8))}</span>
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
