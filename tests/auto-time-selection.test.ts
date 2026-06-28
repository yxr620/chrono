import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import {
  fallbackStartTimeForDate,
  getAutoStartTimeForDate,
  getNextStartTimeAfter,
} from '../src/services/autoTimeSelection';
import type { TimeEntry } from '../src/services/db';

function d(value: string): Date {
  return dayjs(value).toDate();
}

function entry(id: string, startTime: string, endTime: string): TimeEntry {
  const now = d('2026-05-17 12:00');
  return {
    id,
    startTime: d(startTime),
    endTime: d(endTime),
    activity: id,
    categoryId: null,
    goalId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function fmt(value: Date): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss.SSS');
}

test('fallbackStartTimeForDate mirrors the supplied clock onto the target date', () => {
  const result = fallbackStartTimeForDate('2026-05-17', d('2026-06-01 14:35:20.123'));

  assert.equal(fmt(result), '2026-05-17 14:35:20.123');
});

test('getAutoStartTimeForDate returns earliest gap start when final visible end is clipped to day end', () => {
  const entries = [
    entry('early', '2026-05-17 00:00', '2026-05-17 01:00'),
    entry('cross-midnight', '2026-05-17 10:00', '2026-05-18 00:23'),
  ];

  const result = getAutoStartTimeForDate(entries, '2026-05-17', d('2026-05-20 14:35'));

  assert.equal(fmt(result), '2026-05-17 01:00:00.000');
});

test('getAutoStartTimeForDate keeps the latest same-day end when day end is not the selected value', () => {
  const entries = [
    entry('early', '2026-05-17 00:00', '2026-05-17 01:00'),
    entry('later', '2026-05-17 10:00', '2026-05-17 23:00'),
  ];

  const result = getAutoStartTimeForDate(entries, '2026-05-17', d('2026-05-20 14:35'));

  assert.equal(fmt(result), '2026-05-17 23:00:00.000');
});

test('getNextStartTimeAfter returns the next entry start after the edited entry start', () => {
  const entries = [
    entry('edited', '2026-05-17 11:10', '2026-05-17 11:20'),
    entry('next', '2026-05-17 11:30', '2026-05-17 11:40'),
    entry('later', '2026-05-17 12:30', '2026-05-17 12:40'),
  ];

  const result = getNextStartTimeAfter(entries, d('2026-05-17 11:10'), 'edited');

  assert.equal(result && fmt(result), '2026-05-17 11:30:00.000');
});

test('getNextStartTimeAfter excludes the edited entry and returns null without a later start', () => {
  const entries = [
    entry('edited', '2026-05-17 11:10', '2026-05-17 11:20'),
    entry('previous', '2026-05-17 10:30', '2026-05-17 10:40'),
  ];

  const result = getNextStartTimeAfter(entries, d('2026-05-17 11:10'), 'edited');

  assert.equal(result, null);
});
