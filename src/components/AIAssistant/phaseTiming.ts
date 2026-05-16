export interface AssistantPhaseTiming {
  key: string;
  detail?: string;
  level?: number;
  failed?: boolean;
  debugInfo?: string;
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
