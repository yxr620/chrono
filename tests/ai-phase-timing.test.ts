import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPhaseDurationMs,
  markFinalPhaseEnded,
  markFinalPhaseFailed,
  type AssistantPhaseTiming,
} from '../src/components/AIAssistant/phaseTiming';

test('last completed phase keeps its finished duration after loading ends', () => {
  const phases: AssistantPhaseTiming[] = [
    { key: 'preparing', at: 1_000 },
    { key: 'thinking', at: 1_100, endedAt: 21_100 },
  ];

  assert.equal(
    getPhaseDurationMs(phases, 1, { loading: false, now: 40_000 }),
    20_000,
  );
});

test('markFinalPhaseEnded freezes the final active phase once', () => {
  const phases: AssistantPhaseTiming[] = [
    { key: 'preparing', at: 1_000 },
    { key: 'thinking', at: 1_100 },
  ];

  const marked = markFinalPhaseEnded(phases, 21_100);
  assert.equal(marked[1].endedAt, 21_100);

  const markedAgain = markFinalPhaseEnded(marked, 30_000);
  assert.equal(markedAgain[1].endedAt, 21_100);
});

test('markFinalPhaseFailed sets failed:true and freezes endedAt on the final phase', () => {
  const phases: AssistantPhaseTiming[] = [
    { key: 'preparing', at: 1_000, endedAt: 1_100 },
    { key: 'requesting', at: 1_100 },
  ];

  const marked = markFinalPhaseFailed(phases, 5_000);
  assert.equal(marked[1].failed, true);
  assert.equal(marked[1].endedAt, 5_000);

  // already-ended phase keeps its original endedAt but still gets failed flag
  const alreadyEnded: AssistantPhaseTiming[] = [
    { key: 'requesting', at: 1_000, endedAt: 2_000 },
  ];
  const marked2 = markFinalPhaseFailed(alreadyEnded, 9_000);
  assert.equal(marked2[0].failed, true);
  assert.equal(marked2[0].endedAt, 2_000);
});

test('markFinalPhaseFailed is a no-op on empty array', () => {
  assert.deepEqual(markFinalPhaseFailed([], 1_000), []);
});
