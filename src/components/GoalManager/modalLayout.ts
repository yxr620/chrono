interface GoalModalKeyboardLayout {
  viewportHeight: number;
  keyboardHeight: number;
  contentHeight: number;
  baseBreakpoint: number;
  maxBreakpoint?: number;
  sheetChromeHeight?: number;
}

const DEFAULT_MAX_BREAKPOINT = 0.9;
const DEFAULT_SHEET_CHROME_HEIGHT = 40;

/**
 * Returns the smallest sheet breakpoint that leaves the complete form above
 * an overlaying software keyboard.
 */
export function getGoalModalKeyboardBreakpoint({
  viewportHeight,
  keyboardHeight,
  contentHeight,
  baseBreakpoint,
  maxBreakpoint = DEFAULT_MAX_BREAKPOINT,
  sheetChromeHeight = DEFAULT_SHEET_CHROME_HEIGHT,
}: GoalModalKeyboardLayout): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return baseBreakpoint;
  }

  const requiredHeight =
    Math.max(0, keyboardHeight) +
    Math.max(0, contentHeight) +
    Math.max(0, sheetChromeHeight);
  const breakpoint = Math.min(
    maxBreakpoint,
    Math.max(baseBreakpoint, requiredHeight / viewportHeight),
  );

  // Keep the value stable across renders so Ionic can find it in breakpoints.
  return Number(breakpoint.toFixed(4));
}
