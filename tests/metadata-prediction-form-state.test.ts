import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyMetadataPredictionToSelection,
  clearAutoFilledMetadataSelection,
  type MetadataPredictionSelectionState,
} from '../src/services/metadataPredictionFormState';
import type { PredictionResult } from '../src/services/metadataPredictor';

function prediction(categoryId: string | null, goalId: string | null): PredictionResult {
  return {
    category: {
      id: categoryId,
      confidence: categoryId ? 'high' : null,
      reason: categoryId ? 'exactActivity' : 'noMatch',
    },
    goal: {
      id: goalId,
      confidence: goalId ? 'high' : null,
      reason: goalId ? 'exactActivity' : 'noMatch',
    },
    categoryId,
    goalId,
  };
}

function state(overrides: Partial<MetadataPredictionSelectionState> = {}): MetadataPredictionSelectionState {
  return {
    selectedCategoryId: '',
    selectedGoalId: null,
    autoFilledCategoryId: null,
    autoFilledGoalId: null,
    userPickedCategory: false,
    userPickedGoal: false,
    ...overrides,
  };
}

test('high-confidence prediction fills category and goal and records auto-filled ids', () => {
  const result = applyMetadataPredictionToSelection(
    prediction('cat-work', 'goal-writing'),
    state(),
  );

  assert.deepEqual(result, {
    selectedCategoryId: 'cat-work',
    selectedGoalId: 'goal-writing',
    autoFilledCategoryId: 'cat-work',
    autoFilledGoalId: 'goal-writing',
  });
});

test('empty prediction clears stale auto-filled goal but preserves manual selection', () => {
  const result = applyMetadataPredictionToSelection(
    prediction(null, null),
    state({
      selectedCategoryId: 'cat-manual',
      selectedGoalId: 'goal-auto',
      autoFilledGoalId: 'goal-auto',
      userPickedCategory: true,
    }),
  );

  assert.deepEqual(result, {
    selectedCategoryId: 'cat-manual',
    selectedGoalId: null,
    autoFilledCategoryId: null,
    autoFilledGoalId: null,
  });
});

test('medium prediction does not fill and clears stale automatic values', () => {
  const mediumPrediction: PredictionResult = {
    category: {
      id: 'cat-medium',
      confidence: 'medium',
      reason: 'strongActivityMatch',
    },
    goal: {
      id: 'goal-medium',
      confidence: 'medium',
      reason: 'strongActivityMatch',
    },
    categoryId: null,
    goalId: null,
  };

  const result = applyMetadataPredictionToSelection(
    mediumPrediction,
    state({
      selectedCategoryId: 'cat-auto',
      selectedGoalId: 'goal-auto',
      autoFilledCategoryId: 'cat-auto',
      autoFilledGoalId: 'goal-auto',
    }),
  );

  assert.deepEqual(result, {
    selectedCategoryId: '',
    selectedGoalId: null,
    autoFilledCategoryId: null,
    autoFilledGoalId: null,
  });
});

test('empty activity clears only auto-filled values', () => {
  const result = clearAutoFilledMetadataSelection(
    state({
      selectedCategoryId: 'cat-manual',
      selectedGoalId: 'goal-auto',
      autoFilledCategoryId: 'cat-auto',
      autoFilledGoalId: 'goal-auto',
      userPickedCategory: true,
    }),
  );

  assert.deepEqual(result, {
    selectedCategoryId: 'cat-manual',
    selectedGoalId: null,
    autoFilledCategoryId: null,
    autoFilledGoalId: null,
  });
});

test('required mode fills the structured best-effort category while keeping goal high-only', () => {
  const bestEffort: PredictionResult = {
    category: {
      id: 'cat-global',
      confidence: 'low',
      reason: 'globalCategoryFrequency',
    },
    goal: {
      id: 'goal-medium',
      confidence: 'medium',
      reason: 'strongActivityMatch',
    },
    categoryId: null,
    goalId: null,
  };

  const result = applyMetadataPredictionToSelection(
    bestEffort,
    state(),
    true,
  );

  assert.deepEqual(result, {
    selectedCategoryId: 'cat-global',
    selectedGoalId: null,
    autoFilledCategoryId: 'cat-global',
    autoFilledGoalId: null,
  });
});
