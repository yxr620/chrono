const MANAGED_AI_MODEL_FALLBACK = '由 Chrono 托管服务决定';

export function formatManagedAiModel(model?: string | null): string {
  return model?.trim() || MANAGED_AI_MODEL_FALLBACK;
}

export function formatManagedAiUsageLabel(model?: string | null): string {
  return `当前使用 Chrono 托管 AI · ${formatManagedAiModel(model)}`;
}
