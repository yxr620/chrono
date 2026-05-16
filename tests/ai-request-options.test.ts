import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CHAT_STREAM_REQUEST_OPTIONS,
  CHAT_WITH_TOOLS_REQUEST_OPTIONS,
  toChatCompletionPayloadOptions,
} from '../src/services/ai/llmClient';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = (relativePath: string) =>
  readFile(path.join(rootDir, relativePath), 'utf8');

test('chat completion request options map to the OpenAI-compatible payload shape', () => {
  assert.deepEqual(toChatCompletionPayloadOptions(CHAT_WITH_TOOLS_REQUEST_OPTIONS), {
    stream: false,
    temperature: 0.7,
    max_tokens: 2048,
  });

  assert.deepEqual(toChatCompletionPayloadOptions(CHAT_STREAM_REQUEST_OPTIONS), {
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
  });
});

test('tool call engine debug metadata reuses llmClient request options', async () => {
  const source = await readProjectFile('src/services/ai/toolCallEngine.ts');

  assert.match(source, /CHAT_WITH_TOOLS_REQUEST_OPTIONS/);
  assert.match(source, /CHAT_STREAM_REQUEST_OPTIONS/);
  assert.doesNotMatch(source, /stream:\s*false/);
  assert.doesNotMatch(source, /stream:\s*true/);
  assert.doesNotMatch(source, /temperature:\s*0\.7/);
  assert.doesNotMatch(source, /maxTokens:\s*2048/);
});
