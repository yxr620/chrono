import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatCompactDuration, formatDuration } from '../src/components/shared/phaseDisplay';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = (relativePath: string) =>
  readFile(path.join(rootDir, relativePath), 'utf8');

const cssBlock = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 's'));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[0];
};

test('AI phase indicators use flat text glyphs instead of emoji icons', async () => {
  const source = await readProjectFile('src/components/shared/phaseDisplay.ts');
  const phaseConfig = source.match(/const PHASE_CONFIG[\s\S]*?\n\};/)?.[0] || '';

  assert.doesNotMatch(phaseConfig, /📋|💭|🔧|✍️|⏳/u);
  assert.match(phaseConfig, /preparing:\s*\{\s*icon:\s*'\[\]'/);
  assert.match(phaseConfig, /requesting:\s*\{\s*icon:\s*'>'/);
  assert.match(phaseConfig, /reasoning:\s*\{\s*icon:\s*'~'/);
  assert.match(phaseConfig, /composingTool:\s*\{\s*icon:\s*'\{\}'/);
  assert.match(phaseConfig, /toolCall:\s*\{\s*icon:\s*'\$'/);
  assert.match(phaseConfig, /answering:\s*\{\s*icon:\s*'>>'/);
});

test('AI phase rows keep status and icon aligned with the summary line when expanded', async () => {
  // Phase CSS is now in the shared PhasesIndicator.css
  const css = await readProjectFile('src/components/shared/PhasesIndicator.css');

  assert.match(cssBlock(css, '.ai-phase'), /display:\s*grid;/);
  assert.match(cssBlock(css, '.ai-phase'), /align-items:\s*start;/);
  assert.match(cssBlock(css, '.ai-phase-debug'), /display:\s*block;/);
  assert.match(cssBlock(css, '.ai-phase-debug-summary'), /align-items:\s*center;/);
});

test('AI phase duration badges use compact labels on mobile only', async () => {
  const [source, css] = await Promise.all([
    readProjectFile('src/components/shared/PhasesIndicator.tsx'),
    readProjectFile('src/components/shared/PhasesIndicator.css'),
  ]);
  const mobileCss = css.slice(css.indexOf('@media (max-width: 1023px)'));

  assert.match(source, /const compactDurationLabel = durationMs !== undefined \? formatCompactDuration\(durationMs\) : '';/);
  assert.match(source, /data-compact-label=\{compactDurationLabel\}/);
  assert.match(mobileCss, /\.ai-phase-duration\s*\{[^}]*font-size:\s*0;/s);
  assert.match(
    mobileCss,
    /\.ai-phase-duration::before\s*\{[^}]*content:\s*attr\(data-compact-label\);[^}]*font-size:\s*10px;/s,
  );
});

test('AI phase duration compact formatter removes decimal seconds for mobile', () => {
  assert.equal(formatDuration(1800), '1.8s');
  assert.equal(formatCompactDuration(3), '3ms');
  assert.equal(formatCompactDuration(550), '1s');
  assert.equal(formatCompactDuration(861), '1s');
  assert.equal(formatCompactDuration(1200), '1s');
  assert.equal(formatCompactDuration(1800), '2s');
  assert.equal(formatCompactDuration(61_000), '1m');
});
