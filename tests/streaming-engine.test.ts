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

test('preamble text before a tool call is flushed inline; only the final segment is returned as content', async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    callCount += 1;
    // Step 1: model emits a preamble ("我先查一下") then calls a tool.
    // Step 2: model emits the final answer.
    const body = callCount === 1
      ? [
          'data: {"choices":[{"delta":{"content":"我先查一下"}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"list_categories","arguments":"{}"}}]}}]}',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
          'data: [DONE]',
          '',
        ].join('\n\n')
      : [
          'data: {"choices":[{"delta":{"content":"最终答案"}}]}',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          'data: [DONE]',
          '',
        ].join('\n\n');
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as any;

  try {
    const model = createLanguageModel({ baseURL: 'https://example.com/v1', apiKey: 'sk', model: 'm' });
    const tools = {
      list_categories: tool({
        description: 'list categories',
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => ({ success: true, message: 'ok' }),
      }),
    };
    const inlineFlushes: string[] = [];
    let chunks = '';
    const result = await runStreamingToolCallLoop({
      model,
      messages: [{ role: 'user', content: 'check' }],
      tools,
      callbacks: {
        onPhase: (phase, _detail, _debug, _failed, inlineText) => {
          if (phase === 'answering' && inlineText !== undefined) inlineFlushes.push(inlineText);
        },
        onChunk: (delta) => { chunks += delta; },
      },
      maxSteps: 5,
      modelLabel: 'm',
    });

    // Preamble is flushed inline to its answering row, not kept in the returned content.
    assert.deepEqual(inlineFlushes, ['我先查一下'], 'preamble should flush once as inlineText');
    assert.equal(result.content, '最终答案', 'returned content holds only the final segment');
    // onChunk still streams every delta (callers reset their bottom buffer on the inline flush).
    assert.equal(chunks, '我先查一下最终答案');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
