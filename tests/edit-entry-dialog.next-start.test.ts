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
  assert.match(source, />下次开始<\/button>/);
});
