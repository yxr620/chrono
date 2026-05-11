import React, { useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import dayjs from 'dayjs';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// ============ 常量 ============

const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 7;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT; // 252
const SCROLL_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2); // 108

// 注入隐藏滚动条的 CSS（仅执行一次）
if (typeof document !== 'undefined' && !document.getElementById('_wtp_css')) {
  const s = document.createElement('style');
  s.id = '_wtp_css';
  s.textContent = '.wtp-col::-webkit-scrollbar{display:none}';
  document.head.appendChild(s);
}

// ============ 静态数据 ============

const HOURS: readonly { value: string; label: string }[] = Array.from({ length: 24 }, (_, i) => {
  const v = String(i).padStart(2, '0');
  return { value: v, label: v };
});

const MINUTES: readonly { value: string; label: string }[] = Array.from({ length: 60 }, (_, i) => {
  const v = String(i).padStart(2, '0');
  return { value: v, label: v };
});

const generateDateItems = (): { value: string; label: string }[] => {
  const today = dayjs();
  const todayStr = today.format('YYYY-MM-DD');

  return Array.from({ length: 31 }, (_, i) => {
    const d = today.add(i - 15, 'day');
    const dateStr = d.format('YYYY-MM-DD');
    const label = dateStr === todayStr
      ? `Today ${d.format('MM/DD')}`
      : `${d.format('ddd')} ${d.format('MM/DD')}`;
    return { value: dateStr, label };
  });
};

// ============ ScrollColumn（原生 scroll-snap 滚轮列）============

export interface ScrollColumnHandle {
  getCurrentValue: () => string;
}

interface ScrollColumnProps {
  items: readonly { value: string; label: string }[];
  selectedValue: string;
  onChange: (value: string) => void;
  isDark: boolean;
  fontSize?: number;
  fontFamily?: string;
}

const ScrollColumn = forwardRef<ScrollColumnHandle, ScrollColumnProps>(({
  items, selectedValue, onChange, isDark,
  fontSize = 18, fontFamily,
}, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticRef = useRef(false);
  const initializedRef = useRef(false);
  const lastIndexRef = useRef(-1);

  const textColor = isDark ? '#f1f5f9' : '#1e293b';
  const dimColor = isDark ? '#475569' : '#cbd5e1';

  const selectedIndex = useMemo(
    () => Math.max(0, items.findIndex(i => i.value === selectedValue)),
    [items, selectedValue]
  );

  // 暴露 getCurrentValue：直接从 scrollTop 计算当前选中值
  useImperativeHandle(ref, () => ({
    getCurrentValue: () => {
      const el = scrollRef.current;
      if (!el) return selectedValue;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      return items[clamped].value;
    },
  }), [items, selectedValue]);

  // 同步滚动位置到选中值
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = selectedIndex * ITEM_HEIGHT;

    if (!initializedRef.current) {
      // 首次挂载：等待布局完成后设置滚动位置
      const init = () => {
        if (el.scrollHeight > PICKER_HEIGHT) {
          el.scrollTop = target;
          initializedRef.current = true;
        } else {
          requestAnimationFrame(init);
        }
      };
      requestAnimationFrame(init);
      return;
    }

    // 值被外部修改时，同步滚动位置（避免干扰用户正在进行的滚动或点击触发的平滑滚动）
    if (!programmaticRef.current && Math.abs(el.scrollTop - target) > ITEM_HEIGHT * 0.5) {
      programmaticRef.current = true;
      el.scrollTop = target;
      requestAnimationFrame(() => { programmaticRef.current = false; });
    }
  }, [selectedIndex]);

  // 滚动结束后读取位置并提交值
  const commitScroll = useCallback(() => {
    if (programmaticRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    if (items[clamped].value !== selectedValue) {
      onChange(items[clamped].value);
    }
  }, [items, selectedValue, onChange]);

  // 监听 scroll 事件：触觉反馈 + 去抖提交
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;

    const onScroll = () => {
      if (programmaticRef.current) return;

      // 触觉反馈：跨越项边界时触发震动
      const currentIdx = Math.round(el.scrollTop / ITEM_HEIGHT);
      if (currentIdx !== lastIndexRef.current && lastIndexRef.current !== -1) {
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
          // Web 端不支持，静默失败
        });
      }
      lastIndexRef.current = currentIdx;

      // 去抖提交
      clearTimeout(timer);
      timer = setTimeout(commitScroll, 120);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, [commitScroll]);

  return (
    <div
      ref={scrollRef}
      className="wtp-col"
      style={{
        flex: '1 1 0%',
        height: `${PICKER_HEIGHT}px`,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      } as React.CSSProperties}
    >
      <div style={{ height: `${SCROLL_PADDING}px`, flexShrink: 0 }} />
      {items.map((item, index) => (
        <div
          key={item.value}
          onClick={() => {
            const el = scrollRef.current;
            if (!el || item.value === selectedValue) return;
            programmaticRef.current = true;
            el.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
            onChange(item.value);
            setTimeout(() => { programmaticRef.current = false; }, 300);
          }}
          style={{
            height: `${ITEM_HEIGHT}px`,
            scrollSnapAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${fontSize}px`,
            fontFamily,
            fontWeight: item.value === selectedValue ? 700 : 400,
            color: item.value === selectedValue ? textColor : dimColor,
            transition: 'color 0.15s, font-weight 0.15s',
            flexShrink: 0,
            userSelect: 'none',
            cursor: 'pointer',
          }}
        >
          {item.label}
        </div>
      ))}
      <div style={{ height: `${SCROLL_PADDING}px`, flexShrink: 0 }} />
    </div>
  );
});

ScrollColumn.displayName = 'ScrollColumn';

// ============ WheelTimePicker ============

export interface WheelTimePickerHandle {
  getCurrentValue: () => Date;
}

interface WheelTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  isDark: boolean;
}

export const WheelTimePicker = forwardRef<WheelTimePickerHandle, WheelTimePickerProps>(({ value, onChange, isDark }, ref) => {
  const dateItems = useMemo(() => generateDateItems(), []);
  // 用 ref 持有最新 value，使回调函数引用稳定
  const valueRef = useRef(value);
  valueRef.current = value;

  const dateColRef = useRef<ScrollColumnHandle>(null);
  const hourColRef = useRef<ScrollColumnHandle>(null);
  const minuteColRef = useRef<ScrollColumnHandle>(null);

  const dateVal = dayjs(value).format('YYYY-MM-DD');
  const hourVal = dayjs(value).format('HH');
  const minuteVal = dayjs(value).format('mm');

  // 暴露 getCurrentValue：从三列的 scrollTop 实时计算当前值
  useImperativeHandle(ref, () => ({
    getCurrentValue: () => {
      const dateStr = dateColRef.current?.getCurrentValue() ?? dateVal;
      const hourStr = hourColRef.current?.getCurrentValue() ?? hourVal;
      const minuteStr = minuteColRef.current?.getCurrentValue() ?? minuteVal;
      return dayjs(dateStr)
        .hour(parseInt(hourStr, 10))
        .minute(parseInt(minuteStr, 10))
        .second(0)
        .millisecond(0)
        .toDate();
    },
  }), [dateVal, hourVal, minuteVal]);

  const updateDate = useCallback((v: string) => {
    const cur = dayjs(valueRef.current);
    onChange(dayjs(v).hour(cur.hour()).minute(cur.minute()).second(0).millisecond(0).toDate());
  }, [onChange]);

  const updateHour = useCallback((v: string) => {
    const cur = dayjs(valueRef.current);
    onChange(cur.hour(parseInt(v, 10)).second(0).millisecond(0).toDate());
  }, [onChange]);

  const updateMinute = useCallback((v: string) => {
    const cur = dayjs(valueRef.current);
    onChange(cur.minute(parseInt(v, 10)).second(0).millisecond(0).toDate());
  }, [onChange]);

  const textColor = isDark ? '#f1f5f9' : '#1e293b';

  return (
    <div style={{ position: 'relative' }}>
      {/* 选中行高亮条 */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '2px',
        right: '2px',
        height: `${ITEM_HEIGHT}px`,
        transform: 'translateY(-50%)',
        background: isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(241, 245, 249, 0.8)',
        borderRadius: '12px',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* 三列滚轮 */}
      <div style={{
        display: 'flex',
        height: `${PICKER_HEIGHT}px`,
        position: 'relative',
        overflow: 'hidden',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}>
        <ScrollColumn
          ref={dateColRef}
          items={dateItems}
          selectedValue={dateVal}
          onChange={updateDate}
          isDark={isDark}
          fontSize={16}
        />
        <ScrollColumn
          ref={hourColRef}
          items={HOURS}
          selectedValue={hourVal}
          onChange={updateHour}
          isDark={isDark}
          fontSize={20}
          fontFamily="var(--app-mono-family)"
        />
        <ScrollColumn
          ref={minuteColRef}
          items={MINUTES}
          selectedValue={minuteVal}
          onChange={updateMinute}
          isDark={isDark}
          fontSize={20}
          fontFamily="var(--app-mono-family)"
        />
      </div>

      {/* 冒号分隔符 */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 'calc(66.6% - 4px)',
        transform: 'translateY(-50%)',
        fontSize: '20px',
        fontWeight: 700,
        fontFamily: 'var(--app-mono-family)',
        color: textColor,
        pointerEvents: 'none',
        zIndex: 10,
      }}>:</div>
    </div>
  );
});

WheelTimePicker.displayName = 'WheelTimePicker';

// ============ WheelMonthYearPicker ============
// 2-column wheel for selecting year + month (used with a separate calendar grid)

const pad2 = (n: number) => String(n).padStart(2, '0');

interface WheelMonthYearPickerProps {
  year: number;
  month: number; // 1–12
  onChange: (year: number, month: number) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  isDark: boolean;
}

export const WheelMonthYearPicker: React.FC<WheelMonthYearPickerProps> = ({
  year, month, onChange, min, max, isDark,
}) => {
  const minDjs = useMemo(() => (min ? dayjs(min) : null), [min]);
  const maxDjs = useMemo(() => (max ? dayjs(max) : null), [max]);

  const minYear = minDjs ? minDjs.year() : dayjs().year() - 5;
  const maxYear = maxDjs ? maxDjs.year() : dayjs().year();

  const yearItems = useMemo(
    () =>
      Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
        const y = minYear + i;
        return { value: String(y), label: String(y) };
      }),
    [minYear, maxYear]
  );

  const monthItems = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return { value: pad2(m), label: pad2(m) };
      }),
    []
  );

  const handleYearChange = useCallback(
    (v: string) => {
      const newYear = parseInt(v, 10);
      const startM = minDjs && newYear === minDjs.year() ? minDjs.month() + 1 : 1;
      const endM = maxDjs && newYear === maxDjs.year() ? maxDjs.month() + 1 : 12;
      const clampedMonth = Math.max(startM, Math.min(endM, month));
      onChange(newYear, clampedMonth);
    },
    [month, minDjs, maxDjs, onChange]
  );

  const handleMonthChange = useCallback(
    (v: string) => {
      onChange(year, parseInt(v, 10));
    },
    [year, onChange]
  );

  return (
    <div style={{ position: 'relative' }}>
      {/* Selected row highlight */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '2px',
          right: '2px',
          height: `${ITEM_HEIGHT}px`,
          transform: 'translateY(-50%)',
          background: isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(241, 245, 249, 0.8)',
          borderRadius: '12px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          display: 'flex',
          height: `${PICKER_HEIGHT}px`,
          position: 'relative',
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        }}
      >
        <ScrollColumn
          items={yearItems}
          selectedValue={String(year)}
          onChange={handleYearChange}
          isDark={isDark}
          fontSize={18}
        />
        <ScrollColumn
          items={monthItems}
          selectedValue={pad2(month)}
          onChange={handleMonthChange}
          isDark={isDark}
          fontSize={18}
        />
      </div>
    </div>
  );
};

WheelMonthYearPicker.displayName = 'WheelMonthYearPicker';
