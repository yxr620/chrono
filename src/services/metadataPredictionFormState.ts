import type { PredictionResult } from './metadataPredictor';
import { selectPredictedCategoryId } from './entryCategoryAssignment';

export interface MetadataPredictionSelectionState {
    selectedCategoryId: string;
    selectedGoalId: string | null;
    autoFilledCategoryId: string | null;
    autoFilledGoalId: string | null;
    userPickedCategory: boolean;
    userPickedGoal: boolean;
}

export interface MetadataPredictionSelectionUpdate {
    selectedCategoryId: string;
    selectedGoalId: string | null;
    autoFilledCategoryId: string | null;
    autoFilledGoalId: string | null;
}

export function applyMetadataPredictionToSelection(
    prediction: PredictionResult,
    state: MetadataPredictionSelectionState,
    categoryRequired = false,
): MetadataPredictionSelectionUpdate {
    let selectedCategoryId = state.selectedCategoryId;
    let selectedGoalId = state.selectedGoalId;
    let autoFilledCategoryId: string | null = null;
    let autoFilledGoalId: string | null = null;
    const predictedCategoryId = selectPredictedCategoryId(prediction, categoryRequired);

    if (predictedCategoryId && !state.userPickedCategory) {
        selectedCategoryId = predictedCategoryId;
        autoFilledCategoryId = predictedCategoryId;
    } else if (
        !predictedCategoryId
        && !state.userPickedCategory
        && state.autoFilledCategoryId
        && state.selectedCategoryId === state.autoFilledCategoryId
    ) {
        selectedCategoryId = '';
    }

    if (prediction.goalId && !state.userPickedGoal) {
        selectedGoalId = prediction.goalId;
        autoFilledGoalId = prediction.goalId;
    } else if (
        !prediction.goalId
        && !state.userPickedGoal
        && state.autoFilledGoalId
        && state.selectedGoalId === state.autoFilledGoalId
    ) {
        selectedGoalId = null;
    }

    return {
        selectedCategoryId,
        selectedGoalId,
        autoFilledCategoryId,
        autoFilledGoalId,
    };
}

export function clearAutoFilledMetadataSelection(
    state: MetadataPredictionSelectionState,
): MetadataPredictionSelectionUpdate {
    let selectedCategoryId = state.selectedCategoryId;
    let selectedGoalId = state.selectedGoalId;

    if (
        !state.userPickedCategory
        && state.autoFilledCategoryId
        && state.selectedCategoryId === state.autoFilledCategoryId
    ) {
        selectedCategoryId = '';
    }

    if (
        !state.userPickedGoal
        && state.autoFilledGoalId
        && state.selectedGoalId === state.autoFilledGoalId
    ) {
        selectedGoalId = null;
    }

    return {
        selectedCategoryId,
        selectedGoalId,
        autoFilledCategoryId: null,
        autoFilledGoalId: null,
    };
}
