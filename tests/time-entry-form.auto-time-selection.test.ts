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

test('time entry form records automatic start assignments and clears the anchor on manual start changes', () => {
  assert.match(
    source,
    /const setAutoStartTime = \(value: Date\) => \{\s*autoStartAnchorRef\.current = value\.getTime\(\);\s*setStartTime\(value\);\s*\}/s,
  );
  assert.match(
    source,
    /const setManualStartTime = \(value: Date\) => \{\s*autoStartAnchorRef\.current = null;\s*setStartTime\(value\);\s*\}/s,
  );
  assert.doesNotMatch(source, /Math\.abs\(startTime\.getTime\(\) - prevTs\) < 5000/);
});
