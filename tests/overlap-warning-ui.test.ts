import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readComponent = (relativePath: string) => readFile(path.join(rootDir, relativePath), 'utf8');

const [recordsPageSource, entryListSource, timelineSource] = await Promise.all([
  readComponent('src/components/RecordsPage/RecordsPage.tsx'),
  readComponent('src/components/EntryList/EntryList.tsx'),
  readComponent('src/components/TimelineView/TimelineView.tsx'),
]);

test('records page derives one daily overlap status for both views', () => {
  assert.match(recordsPageSource, /detectEntryOverlaps\(entries,/);
  assert.match(recordsPageSource, /overlapCount=\{dailyOverlapStatus\.count\}/);
  assert.match(recordsPageSource, /overlappingEntryIds=\{dailyOverlapStatus\.entryIds\}/);
});

test('overlapping entry rows expose an accessible warning icon', () => {
  assert.match(entryListSource, /overlappingEntryIds\?\.has\(entry\.id\)/);
  assert.match(entryListSource, /className="entry-overlap-warning"/);
  assert.match(entryListSource, /aria-label="此记录与其他记录时间重叠"/);
});

test('timeline exposes a compact day-level overlap warning', () => {
  assert.match(timelineSource, /overlapCount > 0/);
  assert.match(timelineSource, /className="timeline-overlap-warning"/);
  assert.match(timelineSource, /当天存在 \$\{overlapCount\} 组时间重叠/);
});
