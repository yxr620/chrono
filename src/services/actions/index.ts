import { actionRegistry } from './registry';
import { queryTimeEntriesAction } from './read/queryTimeEntries';
import { listCategoriesAction } from './read/listCategories';
import { listGoalsAction } from './read/listGoals';

actionRegistry.register(queryTimeEntriesAction);
actionRegistry.register(listCategoriesAction);
actionRegistry.register(listGoalsAction);

export { actionRegistry } from './registry';
export type { ActionDefinition, ActionResult, ActionCategory, RiskLevel, ConfirmationCard, ConfirmationChange } from './types';
