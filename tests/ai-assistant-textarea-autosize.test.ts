import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getAssistantTextareaLayout } from '../src/components/AIAssistant/textareaAutosize';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AI assistant textarea hides scrollbar before reaching max height', () => {
  assert.deepEqual(getAssistantTextareaLayout(64), {
    height: '64px',
    overflowY: 'hidden',
  });
});

test('AI assistant textarea scrolls only after reaching max height', () => {
  assert.deepEqual(getAssistantTextareaLayout(160), {
    height: '120px',
    overflowY: 'auto',
  });
});

test('AI assistant textarea starts without a visible vertical scrollbar', async () => {
  const css = await readFile(path.join(rootDir, 'src/components/AIAssistant/AIAssistant.css'), 'utf8');
  const inputBlock = css.match(/\.ai-input\s*\{[^}]*\}/s)?.[0] || '';

  assert.match(inputBlock, /overflow-y:\s*hidden;/);
});
