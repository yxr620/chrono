import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  './TimeEntryForm.tsx'
);

const source = await readFile(componentPath, 'utf8');

test('home activity input imports and uses the document icon', () => {
  assert.match(source, /import\s*\{[^}]*documentTextOutline[^}]*\}\s*from 'ionicons\/icons';/);
  assert.match(source, /icon=\{documentTextOutline\}/);
});

test('home activity input uses the approved retrospective placeholder', () => {
  assert.match(source, /placeholder="做了什么？"/);
  assert.doesNotMatch(source, /placeholder="准备做什么？"/);
});