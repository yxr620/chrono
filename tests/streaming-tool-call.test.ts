import assert from 'node:assert/strict';
import test from 'node:test';
import { actionRegistry } from '../src/services/actions/registry';
import type { ActionDefinition, ConfirmationCard } from '../src/services/actions/types';

function makeAction(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    name: overrides.name ?? 'noop_tool',
    description: overrides.description ?? 'no-op',
    category: overrides.category ?? 'read',
    risk: overrides.risk ?? 'none',
    parameters: overrides.parameters ?? { type: 'object', properties: {} },
    handler: overrides.handler ?? (async () => ({ success: true, message: 'ok' })),
    confirm: overrides.confirm,
  };
}

test('toSdkTools wraps risk:none actions with auto-execute', async () => {
  // isolate registry per test
  (actionRegistry as any).actions = new Map();
  actionRegistry.register(makeAction({ name: 'read_ok' }));

  const tools = actionRegistry.toSdkTools({ onConfirmRequired: async () => true });
  assert.ok(tools.read_ok, 'read_ok should be exposed');
  const result = await (tools.read_ok as any).execute({}, { toolCallId: 't1', messages: [] });
  assert.deepEqual(result, { success: true, message: 'ok' });
});

test('toSdkTools awaits onConfirmRequired for risky actions and aborts on cancel', async () => {
  (actionRegistry as any).actions = new Map();
  actionRegistry.register(makeAction({ name: 'risky_write', risk: 'high' }));

  let receivedCard: ConfirmationCard | null = null;
  const tools = actionRegistry.toSdkTools({
    onConfirmRequired: async (card) => {
      receivedCard = card;
      return false;
    },
  });

  const result = await (tools.risky_write as any).execute({ foo: 'bar' }, { toolCallId: 't2', messages: [] });
  assert.equal(result.success, false);
  assert.match(result.message, /取消/);
  assert.ok(receivedCard, 'confirmation card should have been requested');
});

test('toSdkTools returns rejection when no onConfirmRequired provided for risky action', async () => {
  (actionRegistry as any).actions = new Map();
  actionRegistry.register(makeAction({ name: 'risky_no_confirm', risk: 'high' }));

  const tools = actionRegistry.toSdkTools({});
  const result = await (tools.risky_no_confirm as any).execute({}, { toolCallId: 't3', messages: [] });
  assert.equal(result.success, false);
  assert.match(result.message, /确认机制/);
});

test('toSdkTools catches handler exceptions and returns structured failure', async () => {
  (actionRegistry as any).actions = new Map();
  actionRegistry.register(makeAction({
    name: 'throws',
    handler: async () => { throw new Error('boom'); },
  }));

  const tools = actionRegistry.toSdkTools({ onConfirmRequired: async () => true });
  const result = await (tools.throws as any).execute({}, { toolCallId: 't4', messages: [] });
  assert.equal(result.success, false);
  assert.match(result.message, /工具执行异常.*boom/);
});

import { createLanguageModel, generateChatOnce, streamChatWithTools } from '../src/services/ai/llmClient';
import { tool, jsonSchema } from 'ai';

test('createLanguageModel returns a LanguageModel-shaped object', () => {
  const m = createLanguageModel({
    baseURL: 'https://example.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-test',
  });
  // SDK's LanguageModel has these fields across 4.x and 5.x
  assert.equal(typeof (m as any).modelId, 'string');
  assert.match((m as any).modelId, /gpt-test/);
});

test('streamChatWithTools is a thin wrapper that forwards model+messages+tools', async () => {
  // Replace global fetch with one that returns a minimal SSE stream
  const sseBody = [
    'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}',
    'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}',
    'data: [DONE]',
    '',
  ].join('\n\n');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, _init: any) => new Response(sseBody, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })) as any;

  try {
    const model = createLanguageModel({
      baseURL: 'https://example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });
    const result = streamChatWithTools({
      model,
      messages: [{ role: 'user', content: 'hello' }],
      tools: {},
    });
    let buf = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') buf += (part as any).textDelta ?? (part as any).text ?? '';
    }
    assert.equal(buf, 'hi');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
