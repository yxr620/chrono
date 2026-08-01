import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import {
  calculateMetrics,
  groupByDay,
  groupByDayAndCategory,
  groupByHour,
  groupByWeekAndCategory,
  groupByWeekday,
  processEntries,
} from '../src/services/analysis/processor';
import type { Category, TimeEntry } from '../src/services/db';

const d = (value: string): Date => dayjs(value).toDate();

const category: Category = {
  id: 'work',
  name: '工作',
  color: '#40A9FF',
  order: 1,
  createdAt: d('2026-07-01 00:00'),
  updatedAt: d('2026-07-01 00:00'),
};

const entry = (startTime: string, endTime: string): TimeEntry => ({
  id: `${startTime}-${endTime}`,
  startTime: d(startTime),
  endTime: d(endTime),
  activity: '跨边界工作',
  categoryId: category.id,
  goalId: null,
  createdAt: d(endTime),
  updatedAt: d(endTime),
});

const process = (item: TimeEntry, dateRange?: { start: Date; end: Date }) => (
  processEntries([item], [], [category], dateRange)
);

test('processEntries clips an overlapping record to the selected range', () => {
  const result = process(
    entry('2026-07-09 23:00', '2026-07-11 01:00'),
    { start: d('2026-07-10 00:00'), end: d('2026-07-11 00:00') },
  );

  assert.equal(result.length, 1);
  assert.equal(dayjs(result[0].startTime).format('YYYY-MM-DD HH:mm'), '2026-07-10 00:00');
  assert.equal(dayjs(result[0].endTime).format('YYYY-MM-DD HH:mm'), '2026-07-11 00:00');
  assert.equal(result[0].duration, 24 * 60);
});

test('hour distribution allocates duration across every touched hour', () => {
  const result = groupByHour(process(entry('2026-07-10 09:30', '2026-07-10 11:15')));
  const valueAt = (hour: number) => result.find(item => item.name === `${hour}:00`)?.value;

  assert.equal(valueAt(9), 0.5);
  assert.equal(valueAt(10), 1);
  assert.equal(valueAt(11), 0.3);
});

test('cross-day records are split between daily and weekday totals', () => {
  const dateRange = {
    start: d('2026-07-10 00:00'),
    end: d('2026-07-11 23:59:59'),
  };
  const processed = process(entry('2026-07-10 23:30', '2026-07-11 01:30'), dateRange);
  const daily = groupByDay(processed, dateRange);
  const weekdays = groupByWeekday(processed);

  assert.deepEqual(daily.map(item => item.value), [0.5, 1.5]);
  assert.equal(weekdays.find(item => item.name === '周五')?.value, 0.5);
  assert.equal(weekdays.find(item => item.name === '周六')?.value, 1.5);

  const metrics = calculateMetrics(processed);
  assert.equal(metrics.activeDays, 2);
});

test('daily category trend preserves the full-day uncategorized design after splitting', () => {
  const dateRange = {
    start: d('2026-07-10 00:00'),
    end: d('2026-07-11 23:59:59'),
  };
  const processed = process(entry('2026-07-10 23:30', '2026-07-11 01:30'), dateRange);
  const result = groupByDayAndCategory(processed, dateRange, [category]);

  assert.equal(result.data[0].work, 0.5);
  assert.equal(result.data[0].uncategorized, 23.5);
  assert.equal(result.data[1].work, 1.5);
  assert.equal(result.data[1].uncategorized, 22.5);
});

test('weekly category trend allocates a cross-week record to both complete weeks', () => {
  const weeks = [
    {
      start: d('2026-07-05 00:00'),
      end: d('2026-07-11 23:59:59'),
      label: '07/05-07/11',
    },
    {
      start: d('2026-07-12 00:00'),
      end: d('2026-07-18 23:59:59'),
      label: '07/12-07/18',
    },
  ];
  const processed = process(entry('2026-07-11 23:30', '2026-07-12 01:30'));
  const result = groupByWeekAndCategory(processed, weeks, [category]);

  assert.equal(result.data[0].work, 0.5);
  assert.equal(result.data[0].uncategorized, 167.5);
  assert.equal(result.data[1].work, 1.5);
  assert.equal(result.data[1].uncategorized, 166.5);
});
