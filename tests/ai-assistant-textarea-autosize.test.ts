import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getAssistantTextareaLayout } from '../src/components/AIAssistant/textareaAutosize';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readAssistantCss = () =>
  readFile(path.join(rootDir, 'src/components/AIAssistant/AIAssistant.css'), 'utf8');

const readAssistantSource = () =>
  readFile(path.join(rootDir, 'src/components/AIAssistant/AIAssistant.tsx'), 'utf8');

const getMobileCss = (css: string) => css.slice(css.indexOf('@media (max-width: 1023px)'));

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
  const css = await readAssistantCss();
  const inputBlock = css.match(/\.ai-input\s*\{[^}]*\}/s)?.[0] || '';

  assert.match(inputBlock, /overflow-y:\s*hidden;/);
});

test('AI assistant mobile layout renders normal assistant replies as full-width text, not bubbles', async () => {
  const css = await readAssistantCss();
  const mobileCss = getMobileCss(css);

  assert.match(
    mobileCss,
    /\.ai-msg-assistant\s+\.ai-msg-bubble\s*\{[^}]*max-width:\s*100%;[^}]*width:\s*100%;[^}]*padding:\s*4px 0 0;[^}]*background:\s*transparent;[^}]*border:\s*none;[^}]*border-radius:\s*0;/s,
  );
});

test('AI assistant confirmation messages keep a dedicated framed container on mobile', async () => {
  const [css, source] = await Promise.all([readAssistantCss(), readAssistantSource()]);
  const mobileCss = getMobileCss(css);

  assert.match(source, /ai-msg-confirmation/);
  assert.match(
    mobileCss,
    /\.ai-msg-confirmation\s+\.ai-msg-bubble\s*\{[^}]*max-width:\s*96%;[^}]*padding:\s*10px 14px;[^}]*background:\s*hsl\(var\(--card\)\);[^}]*border:\s*1px solid hsl\(var\(--border\)\);[^}]*border-radius:\s*12px;/s,
  );
});
