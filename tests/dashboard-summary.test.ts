import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import {
  buildDashboardCategorySummary,
  selectRecentMemos,
  type DashboardCategorySummaryItem,
} from '../src/services/analysis/dashboardSummary';
import type { TimeEntry } from '../src/services/db';

const categoryItem = (index: number, value: number): DashboardCategorySummaryItem => ({
  name: `类别 ${index}`,
  value,
  displayColor: `#00000${index}`,
  tint: `rgba(0, 0, ${index}, 0.16)`,
});

const memoEntry = (
  id: string,
  startTime: string,
  memo?: string,
  deleted = false,
): TimeEntry => ({
  id,
  startTime: dayjs(startTime).toDate(),
  endTime: dayjs(startTime).add(1, 'hour').toDate(),
  activity: id,
  memo,
  categoryId: null,
  goalId: null,
  deleted,
  createdAt: dayjs(startTime).toDate(),
  updatedAt: dayjs(startTime).toDate(),
});

test('category summary displays all categories when there are at most six', () => {
  const items = Array.from({ length: 6 }, (_, index) => categoryItem(index + 1, 10 - index));

  assert.deepEqual(buildDashboardCategorySummary(items), items);
});

test('category summary keeps five categories and combines every remaining category', () => {
  const items = Array.from({ length: 8 }, (_, index) => categoryItem(index + 1, 10 - index));
  const result = buildDashboardCategorySummary(items);

  assert.equal(result.length, 6);
  assert.deepEqual(result.slice(0, 5), items.slice(0, 5));
  assert.equal(result[5].name, '其余 3 类');
  assert.equal(result[5].value, items.slice(5).reduce((sum, item) => sum + item.value, 0));
  assert.equal(
    result.reduce((sum, item) => sum + item.value, 0),
    items.reduce((sum, item) => sum + item.value, 0),
  );
});

test('recent memos follow the selected analysis range and newest-first limit', () => {
  const entries = [
    memoEntry('before', '2026-07-31 23:59', '范围外'),
    memoEntry('first', '2026-08-01 08:00', '第一条'),
    memoEntry('blank', '2026-08-01 09:00', '   '),
    memoEntry('deleted', '2026-08-01 10:00', '已删除', true),
    memoEntry('second', '2026-08-01 11:00', '第二条'),
    memoEntry('after', '2026-08-02 00:00', '范围外'),
  ];

  const result = selectRecentMemos(entries, {
    start: dayjs('2026-08-01 00:00').toDate(),
    end: dayjs('2026-08-01 23:59:59').toDate(),
  }, 2);

  assert.deepEqual(result.map(entry => entry.id), ['second', 'first']);
});
