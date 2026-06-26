import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/components/TimeTracker/TimeEntryForm.tsx',
);

const source = await readFile(componentPath, 'utf8');

test('time entry form imports metadata prediction selection helpers', () => {
  assert.match(source, /applyMetadataPredictionToSelection/);
  assert.match(source, /clearAutoFilledMetadataSelection/);
});

test('time entry form tracks prediction generation and auto-filled selections', () => {
  assert.match(source, /predictionSeqRef\s*=\s*useRef\(0\)/);
  assert.match(source, /autoFilledCategoryIdRef\s*=\s*useRef<string \| null>\(null\)/);
  assert.match(source, /autoFilledGoalIdRef\s*=\s*useRef<string \| null>\(null\)/);
});

test('time entry form discards stale prediction results', () => {
  assert.match(source, /predictionSeqRef\.current\s*!==\s*seq/);
});

test('manual category and goal changes clear auto-filled refs', () => {
  assert.match(source, /autoFilledCategoryIdRef\.current\s*=\s*null/);
  assert.match(source, /autoFilledGoalIdRef\.current\s*=\s*null/);
});

test('clicking an existing entry defaults the end time to now instead of ongoing', () => {
  const effectStart = source.indexOf('// 当从记录列表或时间轴点击时，自动设置开始时间和结束时间。');
  const effectEnd = source.indexOf('// 当选中的日期发生变化时，更新开始时间');
  assert.notEqual(effectStart, -1);
  assert.notEqual(effectEnd, -1);

  const effectSource = source.slice(effectStart, effectEnd);
  assert.match(effectSource, /else\s*\{\s*setEndTime\(new Date\(\)\);\s*\}/);
  assert.doesNotMatch(effectSource, /else\s*\{\s*setEndTime\(null\);\s*\}/);
});
