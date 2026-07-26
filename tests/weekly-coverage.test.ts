import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import { calculateDailyCoverage, calculateWeeklyCoverage } from '../src/services/weeklyCoverage';
import type { TimeEntry } from '../src/services/db';

const d = (value: string): Date => dayjs(value).toDate();

const entry = (
  id: string,
  startTime: string,
  endTime: string | null,
  deleted = false,
): TimeEntry => {
  const timestamp = d('2026-07-20 00:00');
  return {
    id,
    startTime: d(startTime),
    endTime: endTime ? d(endTime) : null,
    activity: id,
    categoryId: null,
    goalId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deleted,
  };
};

test('current-week coverage runs from Monday to now', () => {
  const result = calculateWeeklyCoverage(
    [
      entry('monday', '2026-07-20 00:00', '2026-07-21 00:00'),
      entry('wednesday', '2026-07-22 00:00', '2026-07-22 12:00'),
    ],
    d('2026-07-20 08:00'),
    d('2026-07-22 12:00'),
  );

  assert.equal(result.isCurrentWeek, true);
  assert.equal(result.percentage, 60);
  assert.equal(result.totalMilliseconds, 60 * 60 * 60 * 1000);
  assert.equal(result.coveredMilliseconds, 36 * 60 * 60 * 1000);
});

test('a selected historical date uses its complete Monday-to-Monday week', () => {
  const result = calculateWeeklyCoverage(
    [entry('complete-week', '2026-07-13 00:00', '2026-07-20 00:00')],
    d('2026-07-15 12:00'),
    d('2026-07-26 12:00'),
  );

  assert.equal(result.isCurrentWeek, false);
  assert.equal(result.percentage, 100);
  assert.equal(dayjs(result.weekStart).format('YYYY-MM-DD HH:mm'), '2026-07-13 00:00');
  assert.equal(dayjs(result.coverageEnd).format('YYYY-MM-DD HH:mm'), '2026-07-20 00:00');
});

test('overlapping entries are counted once', () => {
  const result = calculateWeeklyCoverage(
    [
      entry('first', '2026-07-13 00:00', '2026-07-15 12:00'),
      entry('overlap', '2026-07-14 00:00', '2026-07-16 00:00'),
    ],
    d('2026-07-15 12:00'),
    d('2026-07-26 12:00'),
  );

  assert.equal(result.coveredMilliseconds, 72 * 60 * 60 * 1000);
  assert.equal(result.percentage, 43);
});

test('an ongoing entry is covered through now', () => {
  const result = calculateWeeklyCoverage(
    [entry('ongoing', '2026-07-20 01:00', null)],
    d('2026-07-20 01:00'),
    d('2026-07-20 02:00'),
  );

  assert.equal(result.coveredMilliseconds, 60 * 60 * 1000);
  assert.equal(result.percentage, 50);
});

test('coverage uses ordinary rounding and may display 100 percent', () => {
  const result = calculateWeeklyCoverage(
    [entry('almost-complete', '2026-07-20 00:00', '2026-07-20 01:39:30')],
    d('2026-07-20 01:00'),
    d('2026-07-20 01:40:00'),
  );

  assert.equal(result.percentage, 100);
});

test('deleted entries do not contribute to coverage', () => {
  const result = calculateWeeklyCoverage(
    [entry('deleted', '2026-07-20 00:00', '2026-07-20 02:00', true)],
    d('2026-07-20 01:00'),
    d('2026-07-20 02:00'),
  );

  assert.equal(result.percentage, 0);
});

test('current-day coverage runs from midnight to now', () => {
  const result = calculateDailyCoverage(
    [entry('morning', '2026-07-20 00:00', '2026-07-20 06:00')],
    d('2026-07-20 08:00'),
    d('2026-07-20 12:00'),
  );

  assert.equal(result.isToday, true);
  assert.equal(result.coveredMilliseconds, 6 * 60 * 60 * 1000);
  assert.equal(result.percentage, 50);
});

test('a historical day uses the complete 24-hour day', () => {
  const result = calculateDailyCoverage(
    [entry('recorded', '2026-07-18 00:00', '2026-07-18 18:00')],
    d('2026-07-18 12:00'),
    d('2026-07-20 12:00'),
  );

  assert.equal(result.isToday, false);
  assert.equal(result.totalMilliseconds, 24 * 60 * 60 * 1000);
  assert.equal(result.percentage, 75);
});
