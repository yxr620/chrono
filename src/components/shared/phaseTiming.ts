import type { AssistantDebugInfoPayload } from '../../services/ai/debugInfo';

export interface AssistantPhaseTiming {
  key: string;
  detail?: string;
  level?: number;
  failed?: boolean;
  debugInfo?: AssistantDebugInfoPayload;
  /**
   * 中间 answering 段的正文。当一段「生成回答」被后续工具调用打断时，
   * 该段文本回填到它自己的阶段行内联展示（默认展开），底部正文只保留最终段。
   */
  inlineText?: string;
  at?: number;
  endedAt?: number;
}

export function getPhaseDurationMs(
  phases: AssistantPhaseTiming[],
  index: number,
  options: { loading?: boolean; now: number },
): number | undefined {
  const phase = phases[index];
  if (!phase?.at) return undefined;

  const next = phases[index + 1];
  if (next?.at) {
    return Math.max(0, next.at - phase.at);
  }

  if (phase.endedAt) {
    return Math.max(0, phase.endedAt - phase.at);
  }

  if (options.loading && index === phases.length - 1) {
    return Math.max(0, options.now - phase.at);
  }

  return undefined;
}

export function markFinalPhaseEnded(
  phases: AssistantPhaseTiming[],
  endedAt = Date.now(),
): AssistantPhaseTiming[] {
  if (phases.length === 0) return phases;

  const last = phases[phases.length - 1];
  if (!last.at || last.endedAt) return phases;

  const next = [...phases];
  next[next.length - 1] = { ...last, endedAt };
  return next;
}

export function markFinalPhaseFailed(
  phases: AssistantPhaseTiming[],
  endedAt = Date.now(),
): AssistantPhaseTiming[] {
  if (phases.length === 0) return phases;
  const last = phases[phases.length - 1];
  const next = [...phases];
  next[next.length - 1] = {
    ...last,
    endedAt: last.endedAt ?? endedAt,
    failed: true,
  };
  return next;
}
