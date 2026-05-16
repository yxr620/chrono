import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSendAssistantMessageFromKeyboard } from '../src/components/AIAssistant/keyboardShortcuts';

type ShortcutEvent = Parameters<typeof shouldSendAssistantMessageFromKeyboard>[0];

function event(overrides: Partial<ShortcutEvent>): ShortcutEvent {
  return {
    key: 'Enter',
    metaKey: false,
    ctrlKey: false,
    isComposing: false,
    nativeEvent: { isComposing: false },
    ...overrides,
  };
}

test('AI assistant does not send on plain Enter', () => {
  assert.equal(shouldSendAssistantMessageFromKeyboard(event({ key: 'Enter' })), false);
});

test('AI assistant sends on Command+Enter', () => {
  assert.equal(shouldSendAssistantMessageFromKeyboard(event({ metaKey: true })), true);
});

test('AI assistant sends on Ctrl+Enter for non-mac keyboards', () => {
  assert.equal(shouldSendAssistantMessageFromKeyboard(event({ ctrlKey: true })), true);
});

test('AI assistant does not send while IME composition is active', () => {
  assert.equal(shouldSendAssistantMessageFromKeyboard(event({ metaKey: true, isComposing: true })), false);
  assert.equal(
    shouldSendAssistantMessageFromKeyboard(event({ metaKey: true, nativeEvent: { isComposing: true } })),
    false,
  );
});
