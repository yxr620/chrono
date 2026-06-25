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
