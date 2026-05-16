/**
 * Action Registry — 注册、查找、执行 action，生成 AI tool definitions
 */

import { jsonSchema, tool, type Tool } from 'ai';
import type { ActionDefinition, ActionCategory, ConfirmationCard } from './types';
import type { ToolDefinition } from '../ai/toolDefinitions';

export interface SdkToolsContext {
  onConfirmRequired?: (card: ConfirmationCard) => Promise<boolean>;
}

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

  /**
   * Build a `Record<string, Tool>` for the Vercel AI SDK.
   * Risky actions block on the `onConfirmRequired` callback; cancellation
   * returns a structured failure that the model sees as a tool_result.
   */
  toSdkTools(ctx: SdkToolsContext): Record<string, Tool> {
    const out: Record<string, Tool> = {};
    for (const action of this.actions.values()) {
      out[action.name] = tool({
        description: action.description,
        // Hand the registry's JSON Schema to the SDK; no zod migration needed.
        // SDK v5 renamed `parameters` → `inputSchema`.
        inputSchema: jsonSchema(action.parameters as any),
        execute: async (args: Record<string, unknown>) => {
          if (action.risk !== 'none') {
            if (!ctx.onConfirmRequired) {
              return {
                success: false,
                message: `已拒绝执行高风险操作 ${action.name}：调用方未提供用户确认机制。`,
              };
            }
            const card = action.confirm
              ? await action.confirm(args)
              : {
                  title: action.description,
                  description: JSON.stringify(args, null, 2),
                  changes: [],
                  risk: action.risk,
                };
            const ok = await ctx.onConfirmRequired(card);
            if (!ok) {
              return { success: false, message: '用户取消了此操作。' };
            }
          }
          try {
            return await action.handler(args);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { success: false, message: `工具执行异常：${msg}` };
          }
        },
      });
    }
    return out;
  }
}

export const actionRegistry = new ActionRegistry();
