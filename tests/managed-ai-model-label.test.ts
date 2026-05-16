import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatManagedAiModel,
  formatManagedAiUsageLabel,
} from '../src/services/ai/managedAiModelLabel';

test('formatManagedAiModel shows the server model when present', () => {
  assert.equal(formatManagedAiModel(' qwen3.6-max-preview '), 'qwen3.6-max-preview');
});

test('formatManagedAiModel falls back when the server does not expose a model', () => {
  assert.equal(formatManagedAiModel(undefined), '由 Chrono 托管服务决定');
  assert.equal(formatManagedAiModel(''), '由 Chrono 托管服务决定');
});

test('formatManagedAiUsageLabel includes the managed model in the usage summary', () => {
  assert.equal(
    formatManagedAiUsageLabel('qwen3.6-max-preview'),
    '当前使用 Chrono 托管 AI · qwen3.6-max-preview',
  );
});
