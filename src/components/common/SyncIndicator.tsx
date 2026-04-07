import { useState, useEffect, useRef, useCallback } from 'react';
import { addSyncStatusListener, getCurrentSyncStatus } from '../../services/syncToast';
import type { SyncStatusPayload, SyncDirection } from '../../services/syncToast';
import './SyncIndicator.css';

interface IndicatorState {
  phase: 'idle' | 'syncing' | 'done' | 'error';
  direction: SyncDirection;
  pushedCount: number;
  pulledCount: number;
}

function payloadToState(payload: SyncStatusPayload): IndicatorState {
  if (payload.phase === 'syncing') {
    return { phase: 'syncing', direction: payload.direction, pushedCount: 0, pulledCount: 0 };
  }
  if (payload.phase === 'done') {
    return {
      phase: 'done',
      direction: payload.direction,
      pushedCount: payload.pushedCount || 0,
      pulledCount: payload.pulledCount || 0,
    };
  }
  return { phase: 'error', direction: payload.direction, pushedCount: 0, pulledCount: 0 };
}

const IDLE_STATE: IndicatorState = { phase: 'idle', direction: 'push', pushedCount: 0, pulledCount: 0 };

export const SyncIndicator: React.FC = () => {
  const [state, setState] = useState<IndicatorState>(() => {
    // Recover state from shared module-level status on mount/remount
    const current = getCurrentSyncStatus();
    if (current && current.phase === 'syncing') {
      return payloadToState(current);
    }
    return IDLE_STATE;
  });
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleStatus = useCallback((payload: SyncStatusPayload) => {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = undefined;
    }

    if (payload.phase === 'syncing') {
      setState(prev => ({
        phase: 'syncing',
        direction: payload.direction,
        pushedCount: prev.phase === 'syncing' ? prev.pushedCount : 0,
        pulledCount: prev.phase === 'syncing' ? prev.pulledCount : 0,
      }));
    } else if (payload.phase === 'done') {
      setState({
        phase: 'done',
        direction: payload.direction,
        pushedCount: payload.pushedCount || 0,
        pulledCount: payload.pulledCount || 0,
      });
      // Auto-hide after animation (0.4s arrow exit + 0.4s count enter + ~2.2s display)
      fadeTimerRef.current = setTimeout(() => {
        setState(prev => prev.phase === 'done' ? { ...prev, phase: 'idle' } : prev);
      }, 3000);
    } else if (payload.phase === 'error') {
      setState({
        phase: 'error',
        direction: payload.direction,
        pushedCount: 0,
        pulledCount: 0,
      });
      fadeTimerRef.current = setTimeout(() => {
        setState(prev => prev.phase === 'error' ? { ...prev, phase: 'idle' } : prev);
      }, 4000);
    }
  }, []);

  useEffect(() => {
    const cleanup = addSyncStatusListener(handleStatus);
    return () => {
      cleanup();
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [handleStatus]);

  if (state.phase === 'idle') return null;

  if (state.phase === 'syncing') {
    return (
      <span className="sync-indicator sync-indicator-syncing" data-app-sync-indicator>
        {(state.direction === 'push' || state.direction === 'both') && (
          <span className="sync-indicator-arrow push">↑</span>
        )}
        {(state.direction === 'pull' || state.direction === 'both') && (
          <span className="sync-indicator-arrow pull">↓</span>
        )}
      </span>
    );
  }

  if (state.phase === 'done') {
    const parts: string[] = [];
    if (state.direction === 'push' || state.direction === 'both') {
      parts.push(`↑${state.pushedCount}`);
    }
    if (state.direction === 'pull' || state.direction === 'both') {
      parts.push(`↓${state.pulledCount}`);
    }

    return (
      <span className="sync-indicator sync-indicator-done" data-app-sync-indicator>
        <span className="sync-exit-arrows">
          {(state.direction === 'push' || state.direction === 'both') && (
            <span className="sync-indicator-arrow push">↑</span>
          )}
          {(state.direction === 'pull' || state.direction === 'both') && (
            <span className="sync-indicator-arrow pull">↓</span>
          )}
        </span>
        <span className="sync-count">{parts.join(' ')}</span>
      </span>
    );
  }

  if (state.phase === 'error') {
    return (
      <span className="sync-indicator sync-indicator-error" title="同步失败" data-app-sync-indicator>
        ⚠
      </span>
    );
  }

  return null;
};
