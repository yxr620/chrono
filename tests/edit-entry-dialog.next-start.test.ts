import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/components/EntryList/EditEntryDialog.tsx',
);

const source = await readFile(componentPath, 'utf8');

test('edit entry dialog wires a next-start shortcut for the end time', () => {
  assert.match(source, /getNextStartTimeAfter/);
  assert.match(source, /const setEndTimeToNextStart = \(\) => \{/);
  assert.match(source, /getNextStartTimeAfter\(startTime,\s*entry\?\.id\)/);
  assert.match(source, /setEndTime\(nextStartTime\)/);
  assert.match(source, /aria-label="将结束时间设为下一条记录的开始时间"[^>]*>下次<\/button>/);
});

test('edit entry dialog uses compact accessible shortcut labels', () => {
  assert.match(source, /aria-label="将开始时间设为上一条记录的结束时间"[^>]*>上次<\/button>/);
  assert.match(source, /aria-label="设为进行中，不设置结束时间"[^>]*>进行中<\/button>/);
});

test('edit entry dialog keeps assignment errors visible without closing', () => {
  assert.match(source, /EntryCategoryAssignmentError/);
  assert.match(source, /error instanceof EntryCategoryAssignmentError/);
  assert.match(source, /showToast\(error\.message,\s*'danger'\)/);
});
