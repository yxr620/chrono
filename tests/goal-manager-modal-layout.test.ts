import assert from 'node:assert/strict';
import test from 'node:test';
import { getGoalModalKeyboardBreakpoint } from '../src/components/GoalManager/modalLayout';

test('goal modal grows only enough to fit its form above the Android keyboard', () => {
  assert.equal(
    getGoalModalKeyboardBreakpoint({
      viewportHeight: 800,
      keyboardHeight: 300,
      contentHeight: 180,
      baseBreakpoint: 0.55,
    }),
    0.65,
  );
});

test('goal modal never shrinks below its resting breakpoint', () => {
  assert.equal(
    getGoalModalKeyboardBreakpoint({
      viewportHeight: 1000,
      keyboardHeight: 100,
      contentHeight: 100,
      baseBreakpoint: 0.55,
    }),
    0.55,
  );
});

test('goal modal caps unusually tall keyboards at the supported maximum', () => {
  assert.equal(
    getGoalModalKeyboardBreakpoint({
      viewportHeight: 800,
      keyboardHeight: 650,
      contentHeight: 180,
      baseBreakpoint: 0.55,
    }),
    0.9,
  );
});

test('goal modal falls back to its resting breakpoint without a viewport height', () => {
  assert.equal(
    getGoalModalKeyboardBreakpoint({
      viewportHeight: 0,
      keyboardHeight: 300,
      contentHeight: 180,
      baseBreakpoint: 0.55,
    }),
    0.55,
  );
});
