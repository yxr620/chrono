import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = (relativePath: string) =>
  readFile(path.join(rootDir, relativePath), 'utf8');

test('manual entry creation sends a short-lived motion signal through the records page', async () => {
  const [form, recordsPage, entryStore] = await Promise.all([
    readProjectFile('src/components/TimeTracker/TimeEntryForm.tsx'),
    readProjectFile('src/components/RecordsPage/RecordsPage.tsx'),
    readProjectFile('src/stores/entryStore.ts'),
  ]);

  assert.match(entryStore, /addEntry:.*Promise<string>/);
  assert.match(entryStore, /stopTracking:.*Promise<string \| null>/);
  assert.match(form, /createdEntryId\s*=\s*await addEntry/);
  assert.match(form, /onEntryCreated\?\.\(createdEntryId\)/);
  assert.doesNotMatch(form, /showToast\('记录已保存',\s*'success'\)/);
  assert.match(form, /completedEntryId\s*=\s*await stopTracking/);
  assert.match(form, /onEntryCreated\?\.\(completedEntryId\)/);
  assert.match(recordsPage, /NEW_ENTRY_MOTION_LIFETIME_MS\s*=\s*700/);
  assert.match(recordsPage, /animatedEntryId=\{animatedEntryId\}/);
  assert.match(recordsPage, /setAnimatedEntryId\(currentId => currentId === entryId \? null : currentId\)/);
});

test('timeline and entry list animate only the newly created entry', async () => {
  const [timeline, timelineCss, entryList, entryListCss] = await Promise.all([
    readProjectFile('src/components/TimelineView/TimelineView.tsx'),
    readProjectFile('src/components/TimelineView/TimelineView.css'),
    readProjectFile('src/components/EntryList/EntryList.tsx'),
    readProjectFile('src/components/EntryList/EntryList.css'),
  ]);

  assert.match(timeline, /block\.id === animatedEntryId \? ' is-new-entry'/);
  assert.match(entryList, /entry\.id === animatedEntryId \? ' is-new-entry'/);
  assert.match(timelineCss, /@keyframes timeline-new-entry-reveal/);
  assert.match(timelineCss, /transform:\s*scaleX\(0\)/);
  assert.match(entryListCss, /@keyframes entry-list-new-entry-in/);
  assert.match(entryListCss, /transform:\s*translateY\(-4px\) scale\(0\.99\)/);
  assert.match(timelineCss, /@media \(prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*?\.timeline-block\.is-new-entry\s*\{[^}]*animation:\s*none/s);
  assert.match(entryListCss, /@media \(prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*?\.entry-item\.is-new-entry\s*\{[^}]*animation:\s*none/s);
});
