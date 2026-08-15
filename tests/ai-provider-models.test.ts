import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getProvider,
  isRetiredAIProviderModel,
  resolveAIProviderModel,
} from '../src/services/ai/providers';

const ALIYUN_MODELS = [
  'deepseek-v4-pro-0813',
  'deepseek-v4-flash-0731',
  'qwen3.8-2.4t-a95b',
];

test('Aliyun provider exposes only the current default models', () => {
  assert.deepEqual(getProvider('qwen')?.models, ALIYUN_MODELS);
});

test('retired Qwen 3.5 and 3.6 models migrate to the new default', () => {
  assert.equal(isRetiredAIProviderModel('qwen', 'qwen3.5-plus'), true);
  assert.equal(isRetiredAIProviderModel('qwen', 'qwen3.6-max-preview'), true);
  assert.equal(resolveAIProviderModel('qwen', 'qwen3.6-flash'), ALIYUN_MODELS[0]);
});

test('current and custom model names are preserved', () => {
  assert.equal(resolveAIProviderModel('qwen', ALIYUN_MODELS[2]), ALIYUN_MODELS[2]);
  assert.equal(resolveAIProviderModel('custom', 'local-model'), 'local-model');
});
