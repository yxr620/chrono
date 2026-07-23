import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const picker = await readFile(
  path.join(root, 'src/components/common/EntryFields/CategoryPicker.tsx'),
  'utf8',
);
const editDialog = await readFile(
  path.join(root, 'src/components/EntryList/EditEntryDialog.tsx'),
  'utf8',
);

test('CategoryPicker supports disabling clear while preserving the default', () => {
  assert.match(picker, /allowClear\?: boolean/);
  assert.match(picker, /allowClear = true/);
  assert.match(picker, /c\.id === selectedId && allowClear \? '' : c\.id/);
});

test('edit dialog prevents clearing Category when assignment is required', () => {
  assert.match(editDialog, /isEntryCategoryRequired/);
  assert.match(editDialog, /categoryRequired/);
  assert.match(editDialog, /c\.id === selectedCategoryId && !categoryRequired \? '' : c\.id/);
});
