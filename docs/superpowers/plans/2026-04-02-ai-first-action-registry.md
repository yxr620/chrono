# AI-First Action Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an Action Registry layer so the AI assistant can read AND write data (entries, goals) and perform data maintenance, with a user-confirmation flow for all mutations.

**Architecture:** New `src/services/actions/` module defines self-describing actions (schema + handler + confirm). The existing `toolCallEngine` is refactored to consume the registry instead of hardcoded tool definitions. The AI chat UI gains a confirmation card component for write operations.

**Tech Stack:** TypeScript, Zustand, Dexie.js, React/Ionic (existing stack — no new dependencies)

**Spec:** `docs/superpowers/specs/2026-04-02-ai-first-action-registry-design.md`

**No automated tests exist in this project.** Validate with `npm run lint` (only lint files you touch) and manual verification.

---

## Task 1: Action Registry Core Types & Registry

**Files:**
- Create: `src/services/actions/types.ts`
- Create: `src/services/actions/registry.ts`

- [ ] **Step 1: Create `src/services/actions/types.ts`**

```typescript
/**
 * Action Registry 核心类型
 * 每个 action 是一个自描述对象——名称、JSON Schema 参数、风险等级、处理函数
 */

export type ActionCategory = 'read' | 'write' | 'maintenance';
export type RiskLevel = 'none' | 'low' | 'high';

export interface ActionResult {
  success: boolean;
  data?: unknown;
  message: string;
}

export interface ConfirmationChange {
  type: 'create' | 'update' | 'delete';
  entity: string;
  summary: string;
}

export interface ConfirmationCard {
  title: string;
  description: string;
  changes: ConfirmationChange[];
  risk: RiskLevel;
}

export interface ActionDefinition {
  name: string;
  description: string;
  category: ActionCategory;
  risk: RiskLevel;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<ActionResult>;
  confirm?: (params: Record<string, unknown>) => Promise<ConfirmationCard>;
}
```

- [ ] **Step 2: Create `src/services/actions/registry.ts`**

```typescript
/**
 * Action Registry — 注册、查找、执行 action，生成 AI tool definitions
 */

import type { ActionDefinition, ActionCategory } from './types';
import type { ToolDefinition } from '../ai/toolDefinitions';

class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  register(action: ActionDefinition): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action "${action.name}" already registered`);
    }
    this.actions.set(action.name, action);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  getByCategory(category: ActionCategory): ActionDefinition[] {
    return this.getAll().filter(a => a.category === category);
  }

  toToolDefinitions(): ToolDefinition[] {
    return this.getAll().map(action => ({
      type: 'function' as const,
      function: {
        name: action.name,
        description: action.description,
        parameters: action.parameters,
      },
    }));
  }
}

export const actionRegistry = new ActionRegistry();
```

- [ ] **Step 3: Lint check**

Run: `npx eslint src/services/actions/types.ts src/services/actions/registry.ts`
Expected: No new errors from these files (pre-existing warnings elsewhere are OK).

- [ ] **Step 4: Commit**

```bash
git add src/services/actions/types.ts src/services/actions/registry.ts
git commit -m "feat(actions): add Action Registry core types and registry"
```

---

## Task 2: Migrate 3 Existing Read-Only Actions

Migrate `query_time_entries`, `list_categories`, `list_goals` from `src/services/ai/toolDefinitions.ts` into registry actions. The execution logic stays identical — just new wrappers.

**Files:**
- Create: `src/services/actions/read/queryTimeEntries.ts`
- Create: `src/services/actions/read/listCategories.ts`
- Create: `src/services/actions/read/listGoals.ts`
- Create: `src/services/actions/index.ts`

- [ ] **Step 1: Create `src/services/actions/read/queryTimeEntries.ts`**

Move the `queryTimeEntries` function body from `toolDefinitions.ts` into a new action definition. Keep exact same logic. Add entry ID (first 8 chars) to output.

The action file should:
1. Import `dayjs`, `db`, `dataService`, `loadRawData`, `processEntries`, `formatDuration` (same imports as current toolDefinitions)
2. Export a const `queryTimeEntriesAction` of type `ActionDefinition`
3. Use `name: 'query_time_entries'`, `category: 'read'`, `risk: 'none'`
4. Copy the exact `parameters` object from `TOOL_DEFINITIONS[0]`
5. The `handler` function is the existing `queryTimeEntries()` logic, returning `{ success: true, message: resultString }`
6. In the detailed records output, prepend each row with `entry.id.slice(0, 8)` as a short ID column

- [ ] **Step 2: Create `src/services/actions/read/listCategories.ts`**

Same pattern:
1. Export `listCategoriesAction` of type `ActionDefinition`
2. `name: 'list_categories'`, `category: 'read'`, `risk: 'none'`
3. Handler wraps existing `listCategories()` logic from toolDefinitions

- [ ] **Step 3: Create `src/services/actions/read/listGoals.ts`**

Same pattern:
1. Export `listGoalsAction` of type `ActionDefinition`
2. `name: 'list_goals'`, `category: 'read'`, `risk: 'none'`
3. Handler wraps existing `listGoals()` logic from toolDefinitions

- [ ] **Step 4: Create `src/services/actions/index.ts`**

```typescript
/**
 * Action Registry — 统一注册入口
 * 导入所有 action 并注册到 registry
 */

import { actionRegistry } from './registry';
import { queryTimeEntriesAction } from './read/queryTimeEntries';
import { listCategoriesAction } from './read/listCategories';
import { listGoalsAction } from './read/listGoals';

// Read actions
actionRegistry.register(queryTimeEntriesAction);
actionRegistry.register(listCategoriesAction);
actionRegistry.register(listGoalsAction);

export { actionRegistry } from './registry';
export type { ActionDefinition, ActionResult, ActionCategory, RiskLevel, ConfirmationCard, ConfirmationChange } from './types';
```

- [ ] **Step 5: Lint check**

Run: `npx eslint src/services/actions/`
Expected: No new errors from these files.

- [ ] **Step 6: Commit**

```bash
git add src/services/actions/
git commit -m "feat(actions): migrate 3 read-only tools to Action Registry"
```

---

## Task 3: Refactor toolCallEngine to Use Registry

Replace hardcoded `TOOL_DEFINITIONS` and `executeTool` switch with registry-driven execution. Add `onConfirmRequired` callback for write operations.

**Files:**
- Modify: `src/services/ai/toolCallEngine.ts`

- [ ] **Step 1: Update imports in toolCallEngine.ts**

Replace:
```typescript
import { TOOL_DEFINITIONS, executeTool } from './toolDefinitions';
```
With:
```typescript
import { actionRegistry } from '../actions';
import type { ConfirmationCard } from '../actions';
```

- [ ] **Step 2: Add `onConfirmRequired` to `ToolCallEngineCallbacks`**

Add to the interface:
```typescript
onConfirmRequired?: (card: ConfirmationCard) => Promise<boolean>;
```

- [ ] **Step 3: Replace tool definitions source**

In `runToolCallLoop`, replace:
```typescript
const response = await chatWithTools(config, messages, TOOL_DEFINITIONS, signal);
```
With:
```typescript
const toolDefs = actionRegistry.toToolDefinitions();
const response = await chatWithTools(config, messages, toolDefs, signal);
```

- [ ] **Step 4: Replace tool execution logic**

In the tool execution loop (where `executeTool` is called), replace the direct execution with registry-based execution that includes confirmation for write actions:

```typescript
for (const tc of response.tool_calls) {
    signal?.throwIfAborted();

    let args: Record<string, unknown> = {};
    try {
        args = JSON.parse(tc.function.arguments);
    } catch {
        args = {};
    }

    const action = actionRegistry.get(tc.function.name);
    if (!action) {
        messages.push({
            role: 'tool',
            content: `未知工具: ${tc.function.name}`,
            tool_call_id: tc.id,
        } as any);
        continue;
    }

    const toolLabel = formatToolLabel(tc.function.name, args);
    callbacks.onPhase('toolCall', toolLabel);

    // Confirmation flow for write/maintenance actions
    if (action.risk !== 'none' && callbacks.onConfirmRequired) {
        const card = action.confirm
            ? await action.confirm(args)
            : {
                title: action.description,
                description: JSON.stringify(args, null, 2),
                changes: [],
                risk: action.risk,
            };

        const confirmed = await callbacks.onConfirmRequired(card);
        if (!confirmed) {
            const toolDebug = JSON.stringify({ tool: tc.function.name, args, result: '用户取消' }, null, 2);
            callbacks.onPhase('toolCall', toolLabel + '（已取消）', toolDebug);
            messages.push({
                role: 'tool',
                content: '用户取消了此操作。',
                tool_call_id: tc.id,
            } as any);
            continue;
        }
    }

    const result = await action.handler(args);

    const toolDebug = JSON.stringify({ tool: tc.function.name, args, result: result.message }, null, 2);
    callbacks.onPhase('toolCall', toolLabel, toolDebug);

    callbacks.onToolCall?.({
        name: tc.function.name,
        args,
        result: result.message,
    });

    messages.push({
        role: 'tool',
        content: result.message,
        tool_call_id: tc.id,
    } as any);
}
```

- [ ] **Step 5: Update `formatToolLabel` for new actions**

Make `formatToolLabel` generic — for unknown action names, just return the action name with args summary:

```typescript
function formatToolLabel(name: string, args: Record<string, unknown>): string {
    switch (name) {
        case 'query_time_entries': {
            const parts = [`${args.start_date} ~ ${args.end_date}`];
            if (args.category) parts.push(`类别: ${args.category}`);
            if (args.goal) parts.push(`目标: ${args.goal}`);
            return `查询记录 (${parts.join(', ')})`;
        }
        case 'list_categories':
            return '获取类别列表';
        case 'list_goals':
            return `获取目标 (${args.start_date} ~ ${args.end_date})`;
        default: {
            // Generic label from action registry description
            const action = actionRegistry.get(name);
            if (action) {
                return action.description.slice(0, 30);
            }
            return name;
        }
    }
}
```

- [ ] **Step 6: Update system prompt with write-tool guidelines**

In `buildSystemPrompt()`, append write-tool usage guidelines after the existing `回答规则` section:

```typescript
// After existing system prompt content, add:
const writeToolsExist = actionRegistry.getByCategory('write').length > 0
    || actionRegistry.getByCategory('maintenance').length > 0;

if (writeToolsExist) {
    prompt += `\n\n## 操作工具使用指南
1. 当用户明确要求新增/修改/删除记录时，使用对应的写入工具
2. 在使用写入工具之前，先用查询工具确认操作对象（如 "删除那条记录" → 先查询找到具体记录）
3. 合并记录时，先查询要合并的记录列表，确认后调用 merge_entries
4. 数据维护操作应先诊断（find_overlaps/find_anomalies），再提出修复建议
5. 不要在用户未请求时主动修改数据
6. 写入操作会触发用户确认弹窗，用户可能会取消——如果取消了，尊重用户决定`;
}
```

- [ ] **Step 7: Lint check**

Run: `npx eslint src/services/ai/toolCallEngine.ts`
Expected: No new errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/ai/toolCallEngine.ts
git commit -m "refactor(ai): toolCallEngine uses Action Registry instead of hardcoded tools"
```

---

## Task 4: Confirmation Card UI Component

Add a confirmation card component to the AI chat, and wire it into the chat flow.

**Files:**
- Create: `src/components/AIAssistant/ConfirmationCard.tsx`
- Create: `src/components/AIAssistant/ConfirmationCard.css`
- Modify: `src/components/AIAssistant/AIAssistant.tsx`

- [ ] **Step 1: Create `ConfirmationCard.tsx`**

A React component that renders a confirmation card inside the chat message flow. Props:
- `card: ConfirmationCard` — the action's confirmation data  
- `onConfirm: () => void`
- `onCancel: () => void`
- `resolved?: 'confirmed' | 'cancelled'` — after user acts, show read-only state

The component should:
- Show title with risk-colored left border (green=low, red=high)
- List changes with type icons (＋=create, ✎=update, ✕=delete)
- Show Confirm/Cancel buttons when not yet resolved  
- Show resolved state text when already acted upon  

Style with plain CSS using existing HSL variables.

- [ ] **Step 2: Create `ConfirmationCard.css`**

Style the card using existing design patterns:
- `.confirm-card` container with border-left color by risk
- `.confirm-card-title`, `.confirm-card-changes`, `.confirm-card-actions`
- `.confirm-change-create` (green), `.confirm-change-update` (blue), `.confirm-change-delete` (red)
- `.confirm-card-resolved` for after confirmation  
- Use `hsl(var(--...))` pattern for theming

- [ ] **Step 3: Wire confirmation into AIAssistant.tsx**

In the `handleSend` function, add `onConfirmRequired` to the callbacks passed to `runToolCallLoop`. This callback should:

1. Store the `ConfirmationCard` data in component state along with a Promise resolver
2. Render the `ConfirmationCard` component in the message flow (insert it into the current AI message's phases or as a special message)
3. When user clicks confirm/cancel, resolve the promise with true/false
4. Return the promise to the engine

Implementation approach:
- Add state: `pendingConfirmation: { card: ConfirmationCard; resolve: (confirmed: boolean) => void } | null`
- In `onConfirmRequired` callback: set the state and return a new Promise whose resolver is stored
- Render `ConfirmationCard` at the bottom of the message list when `pendingConfirmation` is set
- On confirm/cancel: call `resolve(true/false)`, clear the pending state, store the resolution for read-only display

- [ ] **Step 4: Lint check**

Run: `npx eslint src/components/AIAssistant/ConfirmationCard.tsx src/components/AIAssistant/AIAssistant.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/AIAssistant/ConfirmationCard.tsx src/components/AIAssistant/ConfirmationCard.css src/components/AIAssistant/AIAssistant.tsx
git commit -m "feat(ai): add confirmation card UI for write operations"
```

---

## Task 5: Write Actions — Entry CRUD

Implement `add_entry`, `update_entry`, `delete_entry` actions.

**Files:**
- Create: `src/services/actions/write/addEntry.ts`
- Create: `src/services/actions/write/updateEntry.ts`
- Create: `src/services/actions/write/deleteEntry.ts`
- Modify: `src/services/actions/index.ts` (register new actions)

- [ ] **Step 1: Create `addEntry.ts`**

Action `add_entry`:
- Parameters: `date` (YYYY-MM-DD, required), `start_time` (HH:mm, required), `end_time` (HH:mm, required), `activity` (string, required), `category` (string, optional — category name), `goal` (string, optional — goal name)
- Handler:
  1. Parse `date + start_time` → `startTime: Date`, `date + end_time` → `endTime: Date`
  2. If `category` provided: fuzzy match name → `categoryId` (same logic as existing `queryTimeEntries`)
  3. If `goal` provided: fuzzy match name → `goalId` (same logic)
  4. Call `dataService.entries.add({ startTime, endTime, activity, categoryId, goalId })`
  5. Call `useEntryStore.getState().loadEntries()`
  6. Call `autoPush('AI添加记录后')`
  7. Return `ActionResult` with success message
- Confirm: Generate card showing the record to be created

- [ ] **Step 2: Create `updateEntry.ts`**

Action `update_entry`:
- Parameters: `entry_id` (string, required — supports 8-char prefix match), `activity`, `category`, `goal`, `start_time`, `end_time` (all optional)
- Handler:
  1. Find entry by ID prefix match: `db.entries.filter(e => e.id.startsWith(entryId) && !e.deleted)`
  2. Build updates object from provided fields (resolve category/goal names to IDs)
  3. Call `dataService.entries.update(fullId, updates)`
  4. Call `useEntryStore.getState().loadEntries()`
  5. Call `autoPush('AI更新记录后')`
- Confirm: Show before → after comparison

- [ ] **Step 3: Create `deleteEntry.ts`**

Action `delete_entry`:
- Parameters: `entry_id` (string, required)
- Handler:
  1. Find entry by ID prefix match
  2. Call `dataService.entries.delete(fullId)`
  3. Call `useEntryStore.getState().loadEntries()`
  4. Call `autoPush('AI删除记录后')`
- Confirm: Show the record to be deleted, red-highlighted

- [ ] **Step 4: Register in `index.ts`**

Add imports for all 3 new actions and `actionRegistry.register()` calls.

- [ ] **Step 5: Lint check**

Run: `npx eslint src/services/actions/write/ src/services/actions/index.ts`

- [ ] **Step 6: Commit**

```bash
git add src/services/actions/write/ src/services/actions/index.ts
git commit -m "feat(actions): add entry CRUD write actions (add/update/delete)"
```

---

## Task 6: Write Actions — Entry Merge & Split

**Files:**
- Create: `src/services/actions/write/mergeEntries.ts`
- Create: `src/services/actions/write/splitEntry.ts`
- Modify: `src/services/actions/index.ts`

- [ ] **Step 1: Create `mergeEntries.ts`**

Action `merge_entries`:
- Parameters: `entry_ids` (string[], min 2, required), `activity` (string, optional), `category` (string, optional), `goal` (string, optional)
- Handler:
  1. Resolve all entries by ID prefix
  2. Sort by startTime
  3. New entry: earliest startTime, latest endTime, merged activity/category/goal
  4. `dataService.entries.add(newEntry)`
  5. Soft-delete all original entries: `dataService.entries.delete(id)` for each
  6. `useEntryStore.getState().loadEntries()` + `autoPush('AI合并记录后')`
- Confirm: List all entries being merged + show the merged result

- [ ] **Step 2: Create `splitEntry.ts`**

Action `split_entry`:
- Parameters: `entry_id` (string, required), `split_time` (HH:mm, required), `first_activity` (optional), `second_activity` (optional)
- Handler:
  1. Find entry by ID prefix
  2. Parse split_time relative to entry's date
  3. Validate split_time is between startTime and endTime
  4. Update original entry: `endTime = splitTime`
  5. Create new entry: `startTime = splitTime`, `endTime = original endTime`
  6. `useEntryStore.getState().loadEntries()` + `autoPush('AI拆分记录后')`
- Confirm: Show before and after (2 resulting entries)

- [ ] **Step 3: Register in `index.ts`**

- [ ] **Step 4: Lint check**

Run: `npx eslint src/services/actions/write/ src/services/actions/index.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/actions/write/ src/services/actions/index.ts
git commit -m "feat(actions): add merge and split entry actions"
```

---

## Task 7: Write Actions — Goal CRUD

**Files:**
- Create: `src/services/actions/write/addGoal.ts`
- Create: `src/services/actions/write/updateGoal.ts`
- Create: `src/services/actions/write/deleteGoal.ts`
- Modify: `src/services/actions/index.ts`

- [ ] **Step 1: Create `addGoal.ts`**

Action `add_goal`:
- Parameters: `date` (YYYY-MM-DD, required), `name` (string, required), `color` (string, optional)
- Handler: `dataService.goals.add({ name, date, color })` → `useGoalStore.getState().loadGoals()` → `autoPush()`

- [ ] **Step 2: Create `updateGoal.ts`**

Action `update_goal`:
- Parameters: `goal_id` (string, required), `name` (optional), `color` (optional)
- Handler: Find goal by prefix → `dataService.goals.update(id, updates)` → `loadGoals()` → `autoPush()`

- [ ] **Step 3: Create `deleteGoal.ts`**

Action `delete_goal`:
- Parameters: `goal_id` (string, required)
- Handler: find by prefix → `dataService.goals.delete(id)` → `loadGoals()` → `autoPush()`
- risk: 'high'

- [ ] **Step 4: Register in `index.ts`**

- [ ] **Step 5: Lint check**

Run: `npx eslint src/services/actions/write/ src/services/actions/index.ts`

- [ ] **Step 6: Commit**

```bash
git add src/services/actions/write/ src/services/actions/index.ts
git commit -m "feat(actions): add goal CRUD actions"
```

---

## Task 8: Maintenance Actions

**Files:**
- Create: `src/services/actions/maintenance/findOverlaps.ts`
- Create: `src/services/actions/maintenance/findGaps.ts`
- Create: `src/services/actions/maintenance/findAnomalies.ts`
- Create: `src/services/actions/maintenance/autoCategorize.ts`
- Create: `src/services/actions/maintenance/batchUpdate.ts`
- Modify: `src/services/actions/index.ts`

- [ ] **Step 1: Create `findOverlaps.ts`**

Action `find_overlaps` (read-only, risk: none):
- Parameters: `start_date`, `end_date` (both optional)
- Handler: Call `dataService.entries.findOverlaps({ startDate, endDate })`, format results as readable text

- [ ] **Step 2: Create `findGaps.ts`**

Action `find_gaps` (read-only, risk: none):
- Parameters: `start_date`, `end_date`, `min_duration_minutes` (optional, default 30)
- Handler: Call `dataService.entries.findGaps(...)`, format results

- [ ] **Step 3: Create `findAnomalies.ts`**

Action `find_anomalies` (read-only, risk: none):
- Parameters: `max_duration_hours` (optional), `stale_active_hours` (optional)
- Handler: Call `dataService.entries.findAnomalies(...)`, format results

- [ ] **Step 4: Create `autoCategorize.ts`**

Action `auto_categorize` (maintenance, risk: low):
- Parameters: `date` (optional YYYY-MM-DD)
- Handler:
  1. Query entries matching filter where `categoryId` is null
  2. For each, query historical entries with same `activity` name that have a category
  3. Pick most frequent category
  4. Update entries that got a match
  5. Return summary (N categorized, M skipped)
- Confirm: list each entry → proposed category

- [ ] **Step 5: Create `batchUpdate.ts`**

Action `batch_update` (maintenance, risk: high):
- Parameters: `start_date`, `end_date` (required), `filter_category`, `filter_activity` (optional), `new_category`, `new_goal` (optional — at least one required)
- Handler:
  1. Query entries matching filters
  2. Resolve new_category/new_goal names to IDs
  3. Update each matching entry
  4. `loadEntries()` + `autoPush()`
- Confirm: list all matched entries and the proposed changes

- [ ] **Step 6: Register all in `index.ts`**

- [ ] **Step 7: Lint check**

Run: `npx eslint src/services/actions/maintenance/ src/services/actions/index.ts`

- [ ] **Step 8: Commit**

```bash
git add src/services/actions/maintenance/ src/services/actions/index.ts
git commit -m "feat(actions): add maintenance actions (overlaps, gaps, anomalies, auto-categorize, batch-update)"
```

---

## Task 9: Final Integration & Cleanup

**Files:**
- Modify: `src/services/ai/toolDefinitions.ts` (deprecation note)
- Verify: Full build passes

- [ ] **Step 1: Add deprecation comment to `toolDefinitions.ts`**

At the top of `toolDefinitions.ts`, add:
```typescript
/**
 * @deprecated 工具定义已迁移至 src/services/actions/。
 * 本文件保留以供参考，不再被 toolCallEngine 使用。
 * 所有新工具应添加到 src/services/actions/ 目录。
 */
```

- [ ] **Step 2: Full build check**

Run: `npm run build`
Expected: Successful build with no TypeScript errors.

- [ ] **Step 3: Lint check on all changed files**

Run: `npx eslint src/services/actions/ src/services/ai/toolCallEngine.ts src/components/AIAssistant/ConfirmationCard.tsx src/components/AIAssistant/AIAssistant.tsx`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: deprecate old toolDefinitions, final integration cleanup"
```
