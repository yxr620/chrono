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

test('quick capture only applies high-confidence local category predictions', () => {
  assert.match(source, /local\.category\.confidence\s*===\s*'high'/);
  assert.match(source, /local\.category\.id/);
  assert.doesNotMatch(source, /\blocal\.categoryId\b/);
});

test('quick capture only applies high-confidence local goal predictions', () => {
  assert.match(source, /local\.goal\.confidence\s*===\s*'high'/);
  assert.match(source, /local\.goal\.id/);
  assert.doesNotMatch(source, /\blocal\.goalId\b/);
});
