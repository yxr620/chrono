import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPhaseDurationMs,
  markFinalPhaseEnded,
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
