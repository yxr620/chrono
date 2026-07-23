import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import test from 'node:test';

import { setEntryCategoryRequired } from '../src/services/categoryAssignmentPreference';
import { dataService } from '../src/services/dataService';
import { db, type Category, type TimeEntry } from '../src/services/db';
import {
  EntryCategoryAssignmentError,
  resolveEntryCategoryId,
} from '../src/services/entryCategoryAssignment';
import { invalidatePredictionCache } from '../src/services/metadataPredictor';

const day = 86_400_000;

function installStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    } satisfies Storage,
  });
}

function category(id: string, order: number): Category {
  const now = new Date();
  return {
    id,
    name: id,
    color: '#40A9FF',
    order,
    createdAt: now,
    updatedAt: now,
  };
}

function historicalEntry(
  id: string,
  activity: string,
  categoryId: string | null,
  ageInDays: number,
): TimeEntry {
  const endTime = new Date(Date.now() - ageInDays * day);
  return {
    id,
    startTime: new Date(endTime.getTime() - 3_600_000),
    endTime,
    activity,
    categoryId,
    goalId: null,
    createdAt: endTime,
    updatedAt: endTime,
  };
}

async function resetDb(): Promise<void> {
  installStorage();
  await db.delete();
  await db.open();
  await Promise.all([
    db.entries.clear(),
    db.goals.clear(),
    db.categories.clear(),
    db.syncOperations.clear(),
  ]);
  invalidatePredictionCache();
  setEntryCategoryRequired(true);
}

test.beforeEach(resetDb);

test.after(async () => {
  await db.delete();
  db.close();
});

test('required add assigns the global 60-day fallback', async () => {
  await db.categories.bulkPut([category('study', 1), category('work', 2)]);
  await db.entries.bulkPut([
    historicalEntry('work-1', '开会', 'work', 1),
    historicalEntry('work-2', '写周报', 'work', 2),
    historicalEntry('study-1', '读书', 'study', 3),
  ]);

  const id = await dataService.entries.add({
    startTime: new Date(Date.now() - 1_800_000),
    endTime: new Date(),
    activity: '买菜',
    categoryId: null,
    goalId: null,
  });

  assert.equal((await db.entries.get(id))?.categoryId, 'work');
});

test('required add preserves a valid manual category', async () => {
  await db.categories.bulkPut([category('study', 1), category('work', 2)]);

  const resolved = await resolveEntryCategoryId('买菜', 'study');

  assert.equal(resolved, 'study');
});

test('required assignment replaces a deleted preferred category', async () => {
  const deleted = { ...category('deleted-category', 1), deleted: true };
  const active = category('study', 2);
  await db.categories.bulkPut([deleted, active]);

  const resolved = await resolveEntryCategoryId('读书', deleted.id);

  assert.equal(resolved, active.id);
});

test('required update fills an uncategorized historical entry without touching others', async () => {
  await db.categories.put(category('study', 1));
  await db.entries.bulkPut([
    historicalEntry('edited', '读论文', null, 1),
    historicalEntry('untouched', '散步', null, 2),
  ]);

  await dataService.entries.update('edited', { memo: '补充说明' });

  assert.equal((await db.entries.get('edited'))?.categoryId, 'study');
  assert.equal((await db.entries.get('untouched'))?.categoryId, null);
});

test('disabled preference permits a null category', async () => {
  await db.categories.put(category('study', 1));
  setEntryCategoryRequired(false);

  const id = await dataService.entries.add({
    startTime: new Date(Date.now() - 1_800_000),
    endTime: new Date(),
    activity: '不分类',
    categoryId: null,
    goalId: null,
  });

  assert.equal((await db.entries.get(id))?.categoryId, null);
});

test('required write rejects when no active category exists', async () => {
  await assert.rejects(
    () => dataService.entries.add({
      startTime: new Date(Date.now() - 1_800_000),
      endTime: new Date(),
      activity: '无法分类',
      categoryId: null,
      goalId: null,
    }),
    (error: unknown) => (
      error instanceof EntryCategoryAssignmentError
      && error.message === '请先创建至少一个 Category'
    ),
  );
  assert.equal(await db.entries.count(), 0);
});
