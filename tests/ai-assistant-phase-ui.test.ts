import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  // PHASE_CONFIG is now in the shared PhasesIndicator module
  const source = await readProjectFile('src/components/shared/PhasesIndicator.tsx');
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
