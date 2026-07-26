import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = (relativePath: string) =>
  readFile(path.join(rootDir, relativePath), 'utf8');

test('timeline omits hour labels and continuously animates the current-time marker', async () => {
  const [component, css] = await Promise.all([
    readProjectFile('src/components/TimelineView/TimelineView.tsx'),
    readProjectFile('src/components/TimelineView/TimelineView.css'),
  ]);

  assert.doesNotMatch(component, /timeline-labels|timeLabels/);
  assert.match(component, /animationDuration:/);
  assert.match(css, /@keyframes timeline-current-time-progress/);
  assert.match(css, /animation-timing-function:\s*linear/);
  assert.match(css, /\.timeline-current-time\s*\{[^}]*top:\s*0[^}]*height:\s*calc\(var\(--timeline-track-height\) \+ 1px\)/s);
  assert.match(css, /\.timeline-current-time::before\s*\{[^}]*top:\s*-3px[^}]*border-top:\s*4px solid var\(--timeline-now-marker\)/s);
  assert.doesNotMatch(css, /\.timeline-current-time::before\s*\{[^}]*border-radius:\s*50%/s);
});

test('timeline uses horizontal weekly coverage and a compact daily percentage row', async () => {
  const [component, css] = await Promise.all([
    readProjectFile('src/components/TimelineView/TimelineView.tsx'),
    readProjectFile('src/components/TimelineView/TimelineView.css'),
  ]);

  assert.match(component, /calculateDailyCoverage/);
  assert.match(component, /timeline-day-coverage-value/);
  assert.match(css, /\.timeline-week-coverage\s*\{[^}]*align-items:\s*center/s);
  assert.match(css, /--timeline-track-height:\s*8px/);
  assert.match(css, /\.timeline-week-coverage-track\s*\{[^}]*height:\s*var\(--timeline-track-height\)/s);
  assert.match(css, /\.timeline-bar\s*\{[^}]*height:\s*var\(--timeline-track-height\)/s);
  assert.match(css, /--timeline-week-accent:\s*#718096/);
  assert.match(css, /--timeline-now-marker:\s*#ff4d4f/);
  assert.doesNotMatch(css, /--timeline-now-halo/);
});

test('successful pull events reload the data stores used by the timeline', async () => {
  const app = await readProjectFile('src/App.tsx');

  assert.match(app, /addSyncStatusListener/);
  assert.match(app, /payload\.phase !== 'done'/);
  assert.match(app, /payload\.direction !== 'pull'/);
  assert.match(app, /useEntryStore\.getState\(\)\.loadEntries\(\)/);
  assert.match(app, /useGoalStore\.getState\(\)\.loadGoals\(\)/);
  assert.match(app, /useCategoryStore\.getState\(\)\.loadCategories\(\)/);
});
