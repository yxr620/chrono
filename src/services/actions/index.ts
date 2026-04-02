import { actionRegistry } from './registry';
import { queryTimeEntriesAction } from './read/queryTimeEntries';
import { listCategoriesAction } from './read/listCategories';
import { listGoalsAction } from './read/listGoals';
import { addEntryAction } from './write/addEntry';
import { updateEntryAction } from './write/updateEntry';
import { deleteEntryAction } from './write/deleteEntry';

actionRegistry.register(queryTimeEntriesAction);
actionRegistry.register(listCategoriesAction);
actionRegistry.register(listGoalsAction);
actionRegistry.register(addEntryAction);
actionRegistry.register(updateEntryAction);
actionRegistry.register(deleteEntryAction);

export { actionRegistry } from './registry';
export type { ActionDefinition, ActionResult, ActionCategory, RiskLevel, ConfirmationCard, ConfirmationChange } from './types';
