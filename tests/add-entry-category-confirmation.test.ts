import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import test from 'node:test';

import { setEntryCategoryRequired } from '../src/services/categoryAssignmentPreference';
import { db, type Category } from '../src/services/db';
import { addEntryAction } from '../src/services/actions/write/addEntry';
import { invalidatePredictionCache } from '../src/services/metadataPredictor';

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

function category(id: string, name: string, order: number): Category {
  const now = new Date();
  return {
    id,
    name,
    color: '#40A9FF',
    order,
    createdAt: now,
    updatedAt: now,
  };
}

test.beforeEach(async () => {
  installStorage();
  await db.delete();
  await db.open();
  await Promise.all([
    db.entries.clear(),
    db.goals.clear(),
    db.categories.clear(),
  ]);
  invalidatePredictionCache();
  setEntryCategoryRequired(true);
});

test.after(async () => {
  await db.delete();
  db.close();
});

test('required add_entry confirmation displays the cold-start Category', async () => {
  await db.categories.bulkPut([
    category('work', '工作', 2),
    category('study', '学习', 1),
  ]);

  const card = await addEntryAction.confirm!({
    date: '2026-07-23',
    start_time: '09:00',
    end_time: '10:00',
    activity: '第一条记录',
  });

  assert.match(card.changes[0].summary, /\[学习\]/);
});

test('optional add_entry confirmation can remain uncategorized', async () => {
  await db.categories.put(category('study', '学习', 1));
  setEntryCategoryRequired(false);

  const card = await addEntryAction.confirm!({
    date: '2026-07-23',
    start_time: '09:00',
    end_time: '10:00',
    activity: '不分类',
  });

  assert.doesNotMatch(card.changes[0].summary, /\[学习\]/);
});
