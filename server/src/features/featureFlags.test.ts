import assert from 'node:assert/strict';
import test from 'node:test';

import { featureFlagsForEmail } from './featureFlags.js';

test('feature flags include the managed AI model advertised to clients', () => {
  const flags = featureFlagsForEmail('YXR620@gmail.com', {
    allowedSyncEmails: ['other@example.com'],
    allowedAiEmails: ['yxr620@gmail.com'],
    aiModel: 'qwen3.6-max-preview',
  });

  assert.deepEqual(flags, {
    sync: false,
    ai: true,
    aiModel: 'qwen3.6-max-preview',
  });
});

test('feature flags omit an empty managed AI model', () => {
  const flags = featureFlagsForEmail('user@example.com', {
    allowedSyncEmails: ['user@example.com'],
    allowedAiEmails: ['user@example.com'],
    aiModel: '',
  });

  assert.deepEqual(flags, {
    sync: true,
    ai: true,
  });
});
