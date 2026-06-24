import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import test from 'node:test';

import { db, type Goal, type TimeEntry } from '../src/services/db';
import { invalidatePredictionCache, predictMetadata } from '../src/services/metadataPredictor';

const now = () => new Date();
const day = 86_400_000;
const today = '2026-06-24';

function makeGoal(id: string, name: string, date = today): Goal {
  const t = now();
  return {
    id,
    name,
    date,
    type: 'time',
    createdAt: t,
    updatedAt: t,
  };
}

function makeEntry(overrides: Partial<TimeEntry> & { id: string; activity: string }): TimeEntry {
  const t = now();
  return {
    id: overrides.id,
    activity: overrides.activity,
    startTime: overrides.startTime ?? new Date(t.getTime() - 60 * 60 * 1000),
    endTime: overrides.endTime ?? t,
    categoryId: overrides.categoryId ?? null,
    goalId: overrides.goalId ?? null,
    createdAt: overrides.createdAt ?? t,
    updatedAt: overrides.updatedAt ?? t,
    deleted: overrides.deleted ?? false,
  };
}

async function resetDb() {
  await db.delete();
  await db.open();
  await db.entries.clear();
  await db.goals.clear();
  await db.categories.clear();
  invalidatePredictionCache();
}

test.beforeEach(async () => {
  await resetDb();
});

test.after(async () => {
  await db.delete();
  db.close();
});

test('single Chinese character does not select target through historical substring match', async () => {
  const historicalGoal = makeGoal('hist-recogem', 'recogem文章', '2026-06-20');
  const todayGoal = makeGoal('today-recogem', 'recogem文章');
  await db.goals.bulkPut([historicalGoal, todayGoal]);
  await db.entries.put(makeEntry({
    id: 'entry-1',
    activity: '晚上改recogem文章',
    goalId: historicalGoal.id!,
    endTime: new Date(Date.now() - 2 * day),
  }));

  const result = await predictMetadata('上', [todayGoal]);

  assert.equal(result.goalId, null);
  assert.equal(result.goal.id, null);
  assert.notEqual(result.goal.confidence, 'high');
});

test('exact historical activity can map to a strongly related current goal name', async () => {
  const historicalGoal = makeGoal('hist-recogem', 'recogem文章', '2026-06-20');
  const todayGoal = makeGoal('today-recogem', '读recogem文章');
  await db.goals.bulkPut([historicalGoal, todayGoal]);
  await db.entries.put(makeEntry({
    id: 'entry-1',
    activity: '写recogem文章',
    goalId: historicalGoal.id!,
    categoryId: 'work',
    endTime: new Date(Date.now() - 3 * day),
  }));

  const result = await predictMetadata('写recogem文章', [todayGoal]);

  assert.equal(result.goalId, 'today-recogem');
  assert.equal(result.goal.id, 'today-recogem');
  assert.equal(result.goal.confidence, 'high');
  assert.equal(result.goal.reason, 'exactActivity');
});

test('strong activity match only selects target when historical goal name exactly exists today', async () => {
  const historicalGoal = makeGoal('hist-paper', '论文阅读', '2026-06-20');
  const todayGoal = makeGoal('today-paper', '论文阅读');
  await db.goals.bulkPut([historicalGoal, todayGoal]);
  await db.entries.put(makeEntry({
    id: 'entry-1',
    activity: '读论文',
    goalId: historicalGoal.id!,
    endTime: new Date(Date.now() - 1 * day),
  }));

  const result = await predictMetadata('看论文', [todayGoal]);

  assert.equal(result.goalId, 'today-paper');
  assert.equal(result.goal.confidence, 'high');
  assert.equal(result.goal.reason, 'strongActivityMatch');
});

test('direct goal token match supports Chinese bigram and project tokens', async () => {
  const paperGoal = makeGoal('today-paper', '读论文');
  const compGoal = makeGoal('today-comp', '学习 COMP8015 课程');
  await db.goals.bulkPut([paperGoal, compGoal]);

  const paper = await predictMetadata('看论文', [paperGoal, compGoal]);
  assert.equal(paper.goalId, 'today-paper');
  assert.equal(paper.goal.confidence, 'high');
  assert.equal(paper.goal.reason, 'directGoalToken');

  invalidatePredictionCache();
  const comp = await predictMetadata('看 COMP8015 PPT', [paperGoal, compGoal]);
  assert.equal(comp.goalId, 'today-comp');
  assert.equal(comp.goal.confidence, 'high');
  assert.equal(comp.goal.reason, 'directGoalToken');
});

test('history older than 60 days is ignored', async () => {
  const historicalGoal = makeGoal('hist-old', '旧项目', '2026-04-01');
  const todayGoal = makeGoal('today-old', '旧项目');
  await db.goals.bulkPut([historicalGoal, todayGoal]);
  await db.entries.put(makeEntry({
    id: 'old-entry',
    activity: '整理旧项目',
    goalId: historicalGoal.id!,
    categoryId: 'work',
    endTime: new Date(Date.now() - 70 * day),
  }));

  const result = await predictMetadata('整理旧项目', [todayGoal]);

  assert.equal(result.goalId, null);
  assert.equal(result.categoryId, null);
  assert.equal(result.goal.confidence, null);
});

test('recent exact activity can still predict category and goal', async () => {
  const historicalGoal = makeGoal('hist-app', 'APP优化', '2026-06-20');
  const todayGoal = makeGoal('today-app', 'APP优化');
  await db.goals.bulkPut([historicalGoal, todayGoal]);
  await db.entries.put(makeEntry({
    id: 'recent-entry',
    activity: '优化 APP',
    goalId: historicalGoal.id!,
    categoryId: 'work',
    endTime: new Date(Date.now() - 5 * day),
  }));

  const result = await predictMetadata('优化 app', [todayGoal]);

  assert.equal(result.categoryId, 'work');
  assert.equal(result.category.confidence, 'high');
  assert.equal(result.goalId, 'today-app');
  assert.equal(result.goal.confidence, 'high');
});
