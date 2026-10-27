import dayjs from 'dayjs';

// 固定 6 周：任何月份高度一致，切月时底部弹层不会上下跳动
const GRID_CELLS = 42;

// 滑动切月：拖过 MIN_SWIPE_DISTANCE 和容器宽度 SWIPE_WIDTH_RATIO 中较大者即生效；
// 距离不够但够快（轻扫）也算
const MIN_SWIPE_DISTANCE = 48;
const SWIPE_WIDTH_RATIO = 0.2;
const FLICK_MIN_DISTANCE = 24;
const FLICK_MIN_VELOCITY = 0.4; // px/ms

export interface SwipeGesture {
  dx: number;
  dy: number;
  elapsedMs: number;
  width: number;
}

/** 周一开头的月历格子：日期为 YYYY-MM-DD，月初前与月末后的空位为 null */
export const buildMonthGrid = (month: Date): (string | null)[] => {
  const monthStart = dayjs(month).startOf('month');
  const leadingBlanks = (monthStart.day() + 6) % 7;
  const cells: (string | null)[] = Array(leadingBlanks).fill(null);

  for (let day = 1; day <= monthStart.daysInMonth(); day++) {
    cells.push(monthStart.date(day).format('YYYY-MM-DD'));
  }

  while (cells.length < GRID_CELLS) {
    cells.push(null);
  }

  return cells;
};

/** 左滑（dx < 0）去下个月返回 1，右滑去上个月返回 -1，不切换返回 0 */
export const resolveSwipeMonthDelta = ({ dx, dy, elapsedMs, width }: SwipeGesture): -1 | 0 | 1 => {
  const distance = Math.abs(dx);
  if (distance <= Math.abs(dy)) return 0;

  const isLongSwipe = distance >= Math.max(MIN_SWIPE_DISTANCE, width * SWIPE_WIDTH_RATIO);
  const isFlick = distance >= FLICK_MIN_DISTANCE
    && distance / Math.max(elapsedMs, 1) >= FLICK_MIN_VELOCITY;
  if (!isLongSwipe && !isFlick) return 0;

  return dx < 0 ? 1 : -1;
};
