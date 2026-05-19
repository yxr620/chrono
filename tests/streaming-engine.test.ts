import assert from 'node:assert/strict';
import test from 'node:test';
import { createLanguageModel } from '../src/services/ai/llmClient';
import { runStreamingToolCallLoop } from '../src/services/ai/streamingEngine';
import { tool, jsonSchema } from 'ai';

test('runStreamingToolCallLoop emits preparing/requesting/answering phases for a text-only response', async () => {
  const originalFetch = globalThis.fetch;
  const sseBody = [
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    'data: [DONE]',
    '',
  ].join('\n\n');
  globalThis.fetch = (async () => new Response(sseBody, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })) as any;

  try {
    const model = createLanguageModel({ baseURL: 'https://example.com/v1', apiKey: 'sk', model: 'm' });
    const phases: Array<{ phase: string; detail?: string }> = [];
    const result = await runStreamingToolCallLoop({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      callbacks: {
        onPhase: (phase, detail) => phases.push({ phase, detail }),
      },
      modelLabel: 'm',
    });
    assert.equal(result.content, 'hello');
    assert.deepEqual(result.toolCalls, []);
    assert.ok(phases.some(p => p.phase === 'requesting'), 'expected requesting phase');
    assert.ok(phases.some(p => p.phase === 'answering'), 'expected answering phase');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runStreamingToolCallLoop collects toolCalls and emits toolCall phase', async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    callCount += 1;
    const body = callCount === 1
      ? [
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"add_entry","arguments":"{\\"date\\":\\"2026-05-19\\",\\"start_time\\":\\"10:00\\",\\"end_time\\":\\"11:00\\",\\"activity\\":\\"write\\"}"}}]}}]}',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
          'data: [DONE]',
          '',
        ].join('\n\n')
      : [
          'data: {"choices":[{"delta":{"content":""}}]}',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          'data: [DONE]',
          '',
        ].join('\n\n');
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as any;

  try {
    const model = createLanguageModel({ baseURL: 'https://example.com/v1', apiKey: 'sk', model: 'm' });
    const tools = {
      add_entry: tool({
        description: 'add an entry',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            date: { type: 'string' },
            start_time: { type: 'string' },
            end_time: { type: 'string' },
            activity: { type: 'string' },
          },
          required: ['date', 'start_time', 'end_time', 'activity'],
        }),
        execute: async () => ({ success: true, message: 'captured' }),
      }),
    };
    const phases: string[] = [];
    const result = await runStreamingToolCallLoop({
      model,
      messages: [{ role: 'user', content: 'log my work' }],
      tools,
      callbacks: { onPhase: (p) => phases.push(p) },
      maxSteps: 1,
      modelLabel: 'm',
    });
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, 'add_entry');
    assert.equal((result.toolCalls[0].args as any).activity, 'write');
    assert.ok(phases.includes('toolCall'), 'expected toolCall phase');
    assert.equal(callCount, 1, 'maxSteps:1 should prevent a second model round');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
