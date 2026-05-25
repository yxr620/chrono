export const PHASE_CONFIG: Record<string, { label: string; icon: string }> = {
  preparing:     { icon: '[]', label: '准备上下文' },
  requesting:    { icon: '>',  label: '请求模型' },
  reasoning:     { icon: '~',  label: '模型推理中' },
  composingTool: { icon: '{}', label: '构造工具调用' },
  toolCall:      { icon: '$',  label: '调用工具' },
  answering:     { icon: '>>', label: '生成回答' },
  enriching:     { icon: '@',  label: '本地补全字段' },
};

/** 格式化耗时：XXX ms / X.Xs / Xm Ys */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

export function formatCompactDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 10) return `${Math.round(ms)}ms`;
  if (ms < 1000) return '1s';

  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;

  return `${Math.round(minutes / 60)}h`;
}
