import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createModelRequestDebug,
  createToolResultDebug,
  debugInfoToText,
} from '../src/services/ai/debugInfo';

test('model request debug keeps structured messages, tools, and safe request metadata', () => {
  const messages = [
    { role: 'system', content: 'system rules' },
    { role: 'user', content: '昨天做了什么？' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'query_time_entries',
            arguments: '{"start_date":"2026-05-15","end_date":"2026-05-15"}',
          },
        },
      ],
    },
    {
      role: 'tool',
      content: '查询到 2 条记录',
      tool_call_id: 'call_1',
    },
  ];

  const debug = createModelRequestDebug(
    messages,
    [
      {
        type: 'function',
        function: {
          name: 'query_time_entries',
          description: '查询用户的时间记录数据',
          parameters: {
            type: 'object',
            required: ['start_date', 'end_date'],
          },
        },
      },
    ],
    {
      model: 'qwen-test',
      baseURL: 'https://api.example.test/v1',
      stream: false,
      temperature: 0.7,
      maxTokens: 2048,
      apiKey: 'secret-should-not-leak',
    },
  );

  assert.equal(debug.kind, 'modelRequest');
  assert.equal(debug.messages.length, 4);
  assert.equal(debug.messages[2].toolCalls?.[0].id, 'call_1');
  assert.equal(debug.messages[2].toolCalls?.[0].name, 'query_time_entries');
  assert.deepEqual(debug.messages[2].toolCalls?.[0].args, {
    start_date: '2026-05-15',
    end_date: '2026-05-15',
  });
  assert.equal(debug.messages[3].toolCallId, 'call_1');
  assert.equal(debug.tools[0].name, 'query_time_entries');
  assert.equal(debug.tools[0].description, '查询用户的时间记录数据');
  assert.equal(debug.request.model, 'qwen-test');
  assert.equal(debug.request.baseURL, 'https://api.example.test/v1');
  assert.equal((debug.request as Record<string, unknown>).apiKey, undefined);

  const text = debugInfoToText(debug);
  assert.match(text, /MODEL REQUEST/);
  assert.match(text, /query_time_entries/);
  assert.match(text, /call_1/);
  assert.doesNotMatch(text, /secret-should-not-leak/);
});

test('tool result debug keeps action args, result text, status, and tool_call_id', () => {
  const debug = createToolResultDebug({
    tool: 'delete_entry',
    args: { id: 'entry-1' },
    result: '用户取消了此操作。',
    success: false,
    toolCallId: 'call_delete_1',
  });

  assert.equal(debug.kind, 'toolResult');
  assert.equal(debug.tool, 'delete_entry');
  assert.deepEqual(debug.args, { id: 'entry-1' });
  assert.equal(debug.result, '用户取消了此操作。');
  assert.equal(debug.success, false);
  assert.equal(debug.toolCallId, 'call_delete_1');

  const text = debugInfoToText(debug);
  assert.match(text, /TOOL RESULT/);
  assert.match(text, /delete_entry/);
  assert.match(text, /call_delete_1/);
  assert.match(text, /用户取消了此操作。/);
});
