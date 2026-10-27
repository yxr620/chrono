import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import { calculateMonthlyDailyCoverage } from '../src/services/weeklyCoverage';
import { buildMonthGrid, resolveSwipeMonthDelta } from '../src/components/TimelineView/coverageCalendarModel';
import type { TimeEntry } from '../src/services/db';

const d = (value: string): Date => dayjs(value).toDate();

const entry = (
  id: string,
  startTime: string,
  endTime: string | null,
): TimeEntry => {
  const timestamp = d('2026-07-01 00:00');
  return {
    id,
    startTime: d(startTime),
    endTime: endTime ? d(endTime) : null,
    activity: id,
    categoryId: null,
    goalId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

test('monthly coverage splits a cross-midnight entry between its two days', () => {
  const result = calculateMonthlyDailyCoverage(
    [entry('night', '2026-07-18 18:00', '2026-07-19 06:00')],
    d('2026-07-10'),
    d('2026-07-25 12:00'),
  );

  assert.equal(result.get('2026-07-17'), 0);
  assert.equal(result.get('2026-07-18'), 25);
  assert.equal(result.get('2026-07-19'), 25);
  assert.equal(result.get('2026-07-20'), 0);
});

test('monthly coverage measures today up to now and omits future days', () => {
  const result = calculateMonthlyDailyCoverage(
    [entry('morning', '2026-07-20 00:00', '2026-07-20 06:00')],
    d('2026-07-01'),
    d('2026-07-20 12:00'),
  );

  assert.equal(result.get('2026-07-20'), 50);
  assert.equal(result.has('2026-07-21'), false);
  assert.equal(result.size, 20);
});

test('an ongoing entry covers today through now', () => {
  const result = calculateMonthlyDailyCoverage(
    [entry('ongoing', '2026-07-20 06:00', null)],
    d('2026-07-01'),
    d('2026-07-20 12:00'),
  );

  assert.equal(result.get('2026-07-19'), 0);
  assert.equal(result.get('2026-07-20'), 50);
});

test('a past month reports every one of its days', () => {
  const result = calculateMonthlyDailyCoverage([], d('2026-06-15'), d('2026-07-20 12:00'));

  assert.equal(result.size, 30);
  assert.equal(result.get('2026-06-01'), 0);
  assert.equal(result.get('2026-06-30'), 0);
});

test('a future month reports no days', () => {
  const result = calculateMonthlyDailyCoverage([], d('2026-08-01'), d('2026-07-20 12:00'));

  assert.equal(result.size, 0);
});

test('month grid starts weeks on Monday and always spans six weeks', () => {
  const grid = buildMonthGrid(d('2026-10-15'));

  assert.equal(grid.length, 42);
  assert.deepEqual(grid.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(grid[33], '2026-10-31');
  assert.deepEqual(grid.slice(34), [null, null, null, null, null, null, null, null]);
});

test('a month beginning on Sunday places its first day in the last column', () => {
  const grid = buildMonthGrid(d('2026-02-01'));

  assert.deepEqual(grid.slice(0, 7), [null, null, null, null, null, null, '2026-02-01']);
});

test('a long horizontal swipe left moves to the next month', () => {
  assert.equal(resolveSwipeMonthDelta({ dx: -120, dy: 10, elapsedMs: 400, width: 360 }), 1);
});

test('a long horizontal swipe right moves to the previous month', () => {
  assert.equal(resolveSwipeMonthDelta({ dx: 120, dy: -10, elapsedMs: 400, width: 360 }), -1);
});

test('a short slow drag stays on the current month', () => {
  assert.equal(resolveSwipeMonthDelta({ dx: -40, dy: 0, elapsedMs: 400, width: 360 }), 0);
});

test('a short quick flick still changes month', () => {
  assert.equal(resolveSwipeMonthDelta({ dx: -36, dy: 4, elapsedMs: 60, width: 360 }), 1);
});

test('a mostly vertical gesture never changes month', () => {
  assert.equal(resolveSwipeMonthDelta({ dx: -120, dy: 150, elapsedMs: 400, width: 360 }), 0);
});
