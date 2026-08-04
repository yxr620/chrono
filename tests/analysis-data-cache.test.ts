import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { db, type Goal, type TimeEntry } from '../src/services/db';
import { getAnalysisDataSnapshot } from '../src/services/analysis/dataCache';
import { clusterGoals } from '../src/services/analysis/goalCluster';

const now = new Date('2026-08-01T00:00:00');

const makeEntry = (id: string): TimeEntry => ({
  id,
  startTime: now,
  endTime: new Date('2026-08-01T01:00:00'),
  activity: id,
  categoryId: null,
  goalId: null,
  createdAt: now,
  updatedAt: now,
});

const makeGoal = (id: string, name: string): Goal => ({
  id,
  name,
  date: '2026-08-01',
  type: 'time',
  createdAt: now,
  updatedAt: now,
});

test('analysis snapshot is reused until an analysis table changes', async (context) => {
  await Promise.all([db.entries.clear(), db.goals.clear(), db.categories.clear()]);
  context.after(() => Promise.all([db.entries.clear(), db.goals.clear(), db.categories.clear()]));

  await db.entries.put(makeEntry('first'));
  const firstSnapshot = await getAnalysisDataSnapshot();
  const reusedSnapshot = await getAnalysisDataSnapshot();

  assert.strictEqual(reusedSnapshot, firstSnapshot);
  assert.deepEqual(firstSnapshot.entries.map(entry => entry.id), ['first']);

  await db.entries.put(makeEntry('second'));
  const refreshedSnapshot = await getAnalysisDataSnapshot();

  assert.notStrictEqual(refreshedSnapshot, firstSnapshot);
  assert.deepEqual(
    refreshedSnapshot.entries.map(entry => entry.id).sort(),
    ['first', 'second'],
  );

  await db.entries.clear();
  const clearedSnapshot = await getAnalysisDataSnapshot();

  assert.notStrictEqual(clearedSnapshot, refreshedSnapshot);
  assert.equal(clearedSnapshot.entries.length, 0);
});

test('goal clustering collapses repeated daily names before similarity matching', () => {
  const goals = [
    ...Array.from({ length: 300 }, (_, index) => makeGoal(`writing-${index}`, '写作计划')),
    ...Array.from({ length: 300 }, (_, index) => makeGoal(`running-${index}`, '跑步训练')),
  ];

  const clusters = clusterGoals(goals);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map(cluster => cluster.goalIds.length).sort((a, b) => a - b), [300, 300]);
});
