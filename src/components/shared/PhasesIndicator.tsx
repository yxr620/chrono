import React, { useEffect, useState } from 'react';
import type { AssistantPhaseTiming } from './phaseTiming';
import { getPhaseDurationMs } from './phaseTiming';
import { DebugInfoPanel } from './DebugInfoPanel';
import './PhasesIndicator.css';

// 阶段配置：label 和 icon
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

/**
 * 阶段列表指示器
 * - loading=true 时，最后一项显示 spinner；其余显示 ✓
 * - loading=false 时，全部显示 ✓（流程结束），failed 项显示 ✗
 * - 含 debugInfo 的阶段可折叠展开查看详情
 */
export const PhasesIndicator: React.FC<{
  phases: AssistantPhaseTiming[];
  loading?: boolean;
}> = ({ phases, loading }) => {
  // 活跃阶段：每 200ms 刷新 1 次（仅在还在运行时）
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => forceTick(x => x + 1), 200);
    return () => clearInterval(t);
  }, [loading]);

  const now = Date.now();
  return (
    <div className="ai-phases">
      {phases.map((p, i) => {
        const cfg = PHASE_CONFIG[p.key] || { icon: '..', label: '处理中' };
        const isActive = loading && i === phases.length - 1;
        const level = p.level || 0;
        const hasDebug = !!p.debugInfo;
        const forceOpen = isActive && p.key === 'reasoning' && hasDebug;

        const durationMs = getPhaseDurationMs(phases, i, { loading, now });
        const durationLabel = durationMs !== undefined ? formatDuration(durationMs) : '';

        const statusIcon = isActive
          ? <span className="ai-phase-spinner" />
          : p.failed
            ? <span className="ai-phase-cross">✗</span>
            : <span className="ai-phase-check">✓</span>;

        const labelText = p.detail || (isActive ? `${cfg.label}...` : cfg.label);

        const durationBadge = durationLabel
          ? <span className="ai-phase-duration">{durationLabel}</span>
          : null;

        return (
          <div
            key={i}
            className={`ai-phase ${isActive ? 'ai-phase-active' : p.failed ? 'ai-phase-failed' : 'ai-phase-done'}`}
            style={level > 0 ? { paddingLeft: `${level * 20}px` } : undefined}
          >
            {statusIcon}
            <span className="ai-phase-icon">{cfg.icon}</span>
            {hasDebug ? (
              <details
                className={`ai-phase-debug${forceOpen ? ' ai-phase-debug-streaming' : ''}`}
                {...(forceOpen ? { open: true } : {})}
              >
                <summary className="ai-phase-debug-summary">
                  {labelText}
                  {durationBadge}
                </summary>
                <DebugInfoPanel debugInfo={p.debugInfo!} />
              </details>
            ) : (
              <span className="ai-phase-label">
                {labelText}
                {durationBadge}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
