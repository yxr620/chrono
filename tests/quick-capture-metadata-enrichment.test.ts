import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/services/quickCapture/quickCaptureParse.ts',
);

const source = await readFile(sourcePath, 'utf8');

test('quick capture preserves a valid AI Category and fills only missing or invalid values', () => {
  assert.match(source, /isEntryCategoryRequired/);
  assert.match(source, /selectPredictedCategoryId/);
  assert.match(source, /const parsedCategoryName = entry\.params\.category\?\.toLowerCase\(\)/);
  assert.match(source, /const parsedCategory = parsedCategoryName/);
  assert.match(source, /if \(!parsedCategory\)/);
  assert.match(source, /entry\.params\.category = cat\.name/);
});

test('quick capture enrichment source uses structured high-confidence goal guard', () => {
  assert.match(source, /local\.goal\.confidence\s*===\s*'high'/);
  assert.match(source, /local\.goal\.id/);
  assert.doesNotMatch(source, /\blocal\.goalId\b/);
});
