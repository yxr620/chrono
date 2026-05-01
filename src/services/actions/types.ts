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
