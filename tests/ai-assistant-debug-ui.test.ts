import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = (relativePath: string) =>
  readFile(path.join(rootDir, relativePath), 'utf8');

test('AI assistant phase debug uses the structured DebugInfoPanel', async () => {
  const source = await readProjectFile('src/components/AIAssistant/AIAssistant.tsx');

  assert.match(source, /from '\.\.\/shared\/DebugInfoPanel'/);
  assert.match(source, /<DebugInfoPanel\s+debugInfo=\{p\.debugInfo!?\}/);
  assert.doesNotMatch(source, /<pre className="ai-phase-debug-content">\{p\.debugInfo\}<\/pre>/);
});

test('DebugInfoPanel renders distinct sections for request, response, tools, and tool results', async () => {
  const source = await readProjectFile('src/components/shared/DebugInfoPanel.tsx');

  assert.match(source, /case 'systemPrompt'/);
  assert.match(source, /case 'modelRequest'/);
  assert.match(source, /case 'modelResponse'/);
  assert.match(source, /case 'toolResult'/);
  assert.match(source, /ai-debug-message/);
  assert.match(source, /ai-debug-tool/);
  assert.match(source, /ai-debug-code/);
});
