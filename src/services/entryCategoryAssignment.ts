import { isEntryCategoryRequired } from './categoryAssignmentPreference';
import { db } from './db';
import {
  predictCategory,
  type PredictionResult,
} from './metadataPredictor';

export class EntryCategoryAssignmentError extends Error {
  readonly code = 'NO_ACTIVE_CATEGORY';

  constructor() {
    super('请先创建至少一个 Category');
    this.name = 'EntryCategoryAssignmentError';
  }
}

export function selectPredictedCategoryId(
  prediction: PredictionResult,
  required = isEntryCategoryRequired(),
): string | null {
  return required ? prediction.category.id : prediction.categoryId;
}

export async function resolveEntryCategoryId(
  activity: string,
  preferredCategoryId: string | null,
): Promise<string | null> {
  if (!isEntryCategoryRequired()) {
    return preferredCategoryId;
  }

  const activeCategories = (await db.categories.toArray())
    .filter(category => !category.deleted)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const activeIds = new Set(activeCategories.map(category => category.id));

  if (preferredCategoryId && activeIds.has(preferredCategoryId)) {
    return preferredCategoryId;
  }

  if (activeCategories.length === 0) {
    throw new EntryCategoryAssignmentError();
  }

  const prediction = await predictCategory(activity);
  if (prediction.id && activeIds.has(prediction.id)) {
    return prediction.id;
  }

  return activeCategories[0].id;
}
