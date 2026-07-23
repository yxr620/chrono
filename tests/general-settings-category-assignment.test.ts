import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/components/Settings/GeneralSection.tsx',
);
const source = await readFile(sourcePath, 'utf8');

test('general settings exposes the default-on entry Category preference', () => {
  assert.match(source, /isEntryCategoryRequired/);
  assert.match(source, /setEntryCategoryRequired/);
  assert.match(source, /每条记录自动关联 Category/);
  assert.match(source, /最近 60 天最常用的 Category/);
  assert.match(source, /checked=\{categoryRequired\}/);
});
