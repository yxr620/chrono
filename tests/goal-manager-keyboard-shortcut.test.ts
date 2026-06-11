import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldSubmitGoalFromKeyboard,
  type GoalSubmitKeyboardEvent,
} from '../src/components/GoalManager/keyboardShortcuts';

function event(overrides: Partial<GoalSubmitKeyboardEvent> = {}): GoalSubmitKeyboardEvent {
  return {
    key: 'Enter',
    isComposing: false,
    nativeEvent: { isComposing: false },
    ...overrides,
  };
}

test('goal input submits on a normal Enter key', () => {
  assert.equal(shouldSubmitGoalFromKeyboard(event()), true);
});

test('goal input does not submit for non-Enter keys', () => {
  assert.equal(shouldSubmitGoalFromKeyboard(event({ key: 'a' })), false);
});

test('goal input does not submit while IME composition is active', () => {
  assert.equal(shouldSubmitGoalFromKeyboard(event({ isComposing: true })), false);
  assert.equal(
    shouldSubmitGoalFromKeyboard(event({ nativeEvent: { isComposing: true } })),
    false,
  );
});

test('goal input does not submit for the IME fallback key code', () => {
  assert.equal(
    shouldSubmitGoalFromKeyboard(event({ nativeEvent: { isComposing: false, keyCode: 229 } })),
    false,
  );
});
