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

  toToolDefinitionsFor(names: string[]): ToolDefinition[] {
    const wanted = new Set(names);
    return this.toToolDefinitions().filter(t => wanted.has(t.function.name));
  }
}

export const actionRegistry = new ActionRegistry();
