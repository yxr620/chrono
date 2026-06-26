import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import test from 'node:test';

import { db, type Category, type Goal, type TimeEntry } from '../src/services/db';
import { queryTimeEntriesAction } from '../src/services/actions/read/queryTimeEntries';
import { searchMemosAction } from '../src/services/actions/read/searchMemos';

function makeCategory(id: string, name: string): Category {
  const now = new Date('2026-06-01T00:00:00');
  return {
    id,
    name,
    color: '#40A9FF',
    order: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function makeGoal(id: string, name: string): Goal {
  const now = new Date('2026-06-01T00:00:00');
  return {
    id,
    name,
    date: '2026-06-01',
    type: 'time',
    createdAt: now,
    updatedAt: now,
  };
}

function makeEntry(index: number, overrides: Partial<TimeEntry> = {}): TimeEntry {
  const start = new Date(`2026-06-01T${String(8 + index).padStart(2, '0')}:00:00`);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id: overrides.id ?? `entry-${index}`,
    startTime: overrides.startTime ?? start,
    endTime: overrides.endTime ?? end,
    activity: overrides.activity ?? `活动 ${index}`,
    memo: overrides.memo,
    categoryId: overrides.categoryId ?? 'work',
    goalId: overrides.goalId ?? 'goal-1',
    createdAt: overrides.createdAt ?? start,
    updatedAt: overrides.updatedAt ?? end,
    deleted: overrides.deleted ?? false,
  };
}

async function resetDb() {
  await db.delete();
  await db.open();
  await db.entries.clear();
  await db.goals.clear();
  await db.categories.clear();
}

test.beforeEach(async () => {
  await resetDb();
  await db.categories.put(makeCategory('work', '工作'));
  await db.goals.put(makeGoal('goal-1', '项目A'));
});

test.after(async () => {
  await db.delete();
  db.close();
});

test('query_time_entries returns deterministic pagination metadata for explicit pages', async () => {
  await db.entries.bulkPut([0, 1, 2, 3, 4].map(i => makeEntry(i)));

  const result = await queryTimeEntriesAction.handler({
    start_date: '2026-06-01',
    end_date: '2026-06-01',
    limit: 2,
    offset: 2,
  });

  assert.equal(result.success, true);
  assert.match(result.message, /明细分页：第 3-4 条 \/ 共 5 条/);
  assert.match(result.message, /next_offset=4/);
  assert.match(result.message, /previous_offset=0/);

  const data = result.data as any;
  assert.deepEqual(data.pagination, {
    total: 5,
    returned: 2,
    limit: 2,
    offset: 2,
    order: 'start_time_asc',
    details_included: true,
    has_more: true,
    next_offset: 4,
    has_previous: true,
    previous_offset: 0,
  });
  assert.match(result.message, /entry-2/);
  assert.match(result.message, /entry-3/);
  assert.doesNotMatch(result.message, /entry-0/);
  assert.doesNotMatch(result.message, /entry-4/);
});

test('query_time_entries can return summary without detailed rows', async () => {
  await db.entries.bulkPut([0, 1, 2].map(i => makeEntry(i)));

  const result = await queryTimeEntriesAction.handler({
    start_date: '2026-06-01',
    end_date: '2026-06-01',
    include_details: false,
  });

  assert.equal(result.success, true);
  assert.match(result.message, /记录数：3 条/);
  assert.match(result.message, /本次未返回详细记录/);
  assert.doesNotMatch(result.message, /entry-0/);

  const data = result.data as any;
  assert.equal(data.pagination.details_included, false);
  assert.equal(data.pagination.returned, 0);
  assert.equal(data.pagination.has_more, false);
});

test('search_memos applies offset after newest-first sorting', async () => {
  await db.entries.bulkPut([
    makeEntry(0, { memo: '最早 memo' }),
    makeEntry(1, { memo: '中间 memo' }),
    makeEntry(2, { memo: '最新 memo' }),
  ]);

  const result = await searchMemosAction.handler({
    start_date: '2026-06-01',
    end_date: '2026-06-01',
    limit: 2,
    offset: 1,
  });

  assert.equal(result.success, true);
  assert.match(result.message, /共找到 3 条/);
  assert.match(result.message, /明细分页：第 2-3 条 \/ 共 3 条/);
  assert.doesNotMatch(result.message, /最新 memo/);
  assert.match(result.message, /中间 memo/);
  assert.match(result.message, /最早 memo/);

  const data = result.data as any;
  assert.deepEqual(data.pagination, {
    total: 3,
    returned: 2,
    limit: 2,
    offset: 1,
    order: 'start_time_desc',
    has_more: false,
    next_offset: null,
    has_previous: true,
    previous_offset: 0,
  });
});
