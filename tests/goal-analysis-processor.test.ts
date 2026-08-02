import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';

import { db, type Goal, type TimeEntry } from '../src/services/db';
import {
  analyzeGoals,
  getSubGoalDetails,
} from '../src/services/analysis/goalAnalysisProcessor';

const at = (value: string): Date => dayjs(value).toDate();

const goal = (
  id: string,
  name: string,
  options: Partial<Goal> = {},
): Goal => ({
  id,
  name,
  date: '2026-08-01',
  type: 'time',
  createdAt: at('2026-08-01 00:00'),
  updatedAt: at('2026-08-01 00:00'),
  ...options,
});

const entry = (
  id: string,
  startTime: string,
  durationHours: number,
  goalId: string | null,
): TimeEntry => ({
  id,
  startTime: at(startTime),
  endTime: dayjs(startTime).add(durationHours, 'hour').toDate(),
  activity: id,
  categoryId: 'work',
  goalId,
  createdAt: at(startTime),
  updatedAt: at(startTime),
});

test('goal analysis displays active themes only and counts coverage from valid time goals', async (context) => {
  await Promise.all([db.entries.clear(), db.goals.clear()]);
  context.after(() => Promise.all([db.entries.clear(), db.goals.clear()]));

  await db.goals.bulkPut([
    goal('active-goal', '写作计划'),
    goal('inactive-goal', '跑步计划'),
    goal('deleted-goal', '已删除目标', { deleted: true }),
    goal('check-goal', '吃药', { type: 'check' }),
  ]);
  await db.entries.bulkPut([
    entry('active-entry', '2026-08-01 00:00', 2, 'active-goal'),
    entry('deleted-link-entry', '2026-08-01 02:00', 3, 'deleted-goal'),
    entry('check-link-entry', '2026-08-01 05:00', 1, 'check-goal'),
    entry('unlinked-entry', '2026-08-01 06:00', 4, null),
  ]);

  const result = await analyzeGoals({
    start: at('2026-08-01 00:00'),
    end: at('2026-08-01 23:59:59'),
  });

  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].goals[0].id, 'active-goal');
  assert.equal(result.stats[0].activeGoalCount, 1);
  assert.equal(result.overviewStats.totalDuration, 2 * 60);
  assert.equal(result.overviewStats.goalCoverageRate, 0.2);
  assert.equal(result.distribution.length, 1);

  const details = getSubGoalDetails(result.clusters[0], await db.entries.toArray());
  assert.deepEqual(details.map(item => item.goalId), ['active-goal']);
});
