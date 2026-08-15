import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maintenancePageSource = await readFile(
  path.join(rootDir, 'src/components/MaintenancePage/MaintenancePage.tsx'),
  'utf8',
);
const dataValidationSource = await readFile(
  path.join(rootDir, 'src/components/MaintenancePage/DataValidationTab.tsx'),
  'utf8',
);

test('maintenance opens data validation by default', () => {
  assert.match(maintenancePageSource, /useState<TabId>\('validation'\)/);
});

test('data validation starts its initial scan automatically', () => {
  assert.match(dataValidationSource, /useEffect\(\(\) => \{/);
  assert.match(dataValidationSource, /void handleScan\(\)/);
});

test('overlap repairs can trim either entry', () => {
  assert.match(
    dataValidationSource,
    /update\(pair\.entryA\.id!,\s*\{\s*endTime: pair\.entryB\.startTime/,
  );
  assert.match(
    dataValidationSource,
    /update\(pair\.entryB\.id!,\s*\{\s*startTime: pair\.entryA\.endTime!/,
  );
  assert.match(dataValidationSource, /截断A至/);
  assert.match(dataValidationSource, /截断B自/);
  assert.match(dataValidationSource, /disabled=\{!canTrimEntryB\(pair\)\}/);
});
