import React, { useState, useCallback, useRef } from 'react';
import { IonModal, IonIcon, IonButton } from '@ionic/react';
import { closeOutline, stopCircleOutline } from 'ionicons/icons';
import { useAppToast } from '../../hooks/useAppToast';
import { useDateStore } from '../../stores/dateStore';
import { TranscriptInput } from './TranscriptInput';
import { ReviewSequence } from './ReviewSequence';
import {
  loadParseContext,
  parseTranscript,
  type PendingEntry,
} from '../../services/quickCapture/quickCaptureParse';
import type { TimeEntry } from '../../services/db';
import { PhasesIndicator } from '../shared/PhasesIndicator';
import {
  markFinalPhaseEnded,
  markFinalPhaseFailed,
  type AssistantPhaseTiming,
} from '../shared/phaseTiming';
import type { AssistantDebugInfoPayload } from '../../services/ai/debugInfo';
import './QuickCaptureSheet.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
}

type Phase = 'input' | 'parsing' | 'reviewing' | 'done';

export const QuickCaptureSheet: React.FC<Props> = ({ isOpen, onDismiss }) => {
  const [phase, setPhase] = useState<Phase>('input');
  const [transcript, setTranscript] = useState('');
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [pageDateEntries, setPageDateEntries] = useState<TimeEntry[]>([]);
  const [parsePhases, setParsePhases] = useState<AssistantPhaseTiming[]>([]);
  const phasesRef = useRef<AssistantPhaseTiming[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [present] = useAppToast();
  const selectedDate = useDateStore(s => s.selectedDate);

  const reset = useCallback(() => {
    setPhase('input');
    setTranscript('');
    setEntries([]);
    setPageDateEntries([]);
    setParsePhases([]);
    phasesRef.current = [];
  }, []);

  const handleClose = () => {
    // sheet 关闭时也要 abort，避免后台流继续跑
    abortRef.current?.abort();
    abortRef.current = null;
    onDismiss();
    setTimeout(reset, 300);
  };

  const pushPhase = useCallback(
    (
      phase: string,
      detail?: string,
      debugInfo?: AssistantDebugInfoPayload,
      failed?: boolean,
    ) => {
      const prev = phasesRef.current;
      // 如果最后一项 key 相同且当前带 debugInfo，则更新最后一项（补充调试信息 / 失败态）
      if (debugInfo && prev.length > 0 && prev[prev.length - 1].key === phase) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          detail: detail ?? updated[updated.length - 1].detail,
          debugInfo,
          failed: failed ?? updated[updated.length - 1].failed,
        };
        phasesRef.current = updated;
      } else {
        phasesRef.current = [
          ...prev,
          { key: phase, detail, debugInfo, failed, at: Date.now() },
        ];
      }
      setParsePhases([...phasesRef.current]);
    },
    [],
  );

  const handleParse = async () => {
    const text = transcript.trim();
    if (!text) return;
    setPhase('parsing');
    phasesRef.current = [];
    setParsePhases([]);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const ctx = await loadParseContext(new Date(), selectedDate);
      const result = await parseTranscript(text, ctx, { onPhase: pushPhase }, abort.signal);
      phasesRef.current = markFinalPhaseEnded(phasesRef.current);
      setParsePhases([...phasesRef.current]);
      setPageDateEntries(ctx.pageDateEntries);
      setEntries(result.entries);
      setPhase('reviewing');
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      phasesRef.current = isAbort
        ? markFinalPhaseEnded(phasesRef.current)
        : markFinalPhaseFailed(phasesRef.current);
      setParsePhases([...phasesRef.current]);
      if (isAbort) {
        // 保留 transcript 让用户编辑后重试
        setPhase('input');
      } else {
        present({
          message: `解析失败：${err instanceof Error ? err.message : String(err)}`,
          duration: 2500,
          position: 'top',
          color: 'danger',
        });
        setPhase('input');
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleStopParse = () => {
    abortRef.current?.abort();
  };

  const handleAllDone = useCallback(
    (saved: number, skipped: number, failed: number) => {
      const parts: string[] = [];
      if (saved > 0) parts.push(`保存 ${saved} 条`);
      if (skipped > 0) parts.push(`跳过 ${skipped} 条`);
      if (failed > 0) parts.push(`失败 ${failed} 条`);
      present({
        message: parts.join('，') || '完成',
        duration: 2000,
        position: 'top',
        color: failed > 0 ? 'warning' : 'success',
      });
      setPhase('done');
      setTimeout(() => {
        onDismiss();
        reset();
      }, 200);
    },
    [present, onDismiss, reset],
  );

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={handleClose}
      className="quick-capture-sheet"
      breakpoints={[0, 1]}
      initialBreakpoint={1}
    >
      <div className="quick-capture-sheet-content">
        <div className="quick-capture-sheet-header">
          <span className="quick-capture-sheet-title">快速补录</span>
          <IonButton fill="clear" onClick={handleClose}>
            <IonIcon icon={closeOutline} />
          </IonButton>
        </div>

        <div className="quick-capture-sheet-body">
          {phase === 'input' && (
            <>
              {parsePhases.length > 0 && parsePhases[parsePhases.length - 1].failed && (
                <details className="quick-capture-process-trace quick-capture-process-trace-failed">
                  <summary>上次解析失败（{parsePhases.length} 步）— 点击查看</summary>
                  <PhasesIndicator phases={parsePhases} loading={false} />
                </details>
              )}
              <TranscriptInput
                value={transcript}
                onChange={setTranscript}
                onSubmit={handleParse}
              />
            </>
          )}
          {phase === 'parsing' && (
            <div className="quick-capture-parsing">
              <PhasesIndicator phases={parsePhases} loading={true} />
              <div className="quick-capture-parsing-actions">
                <IonButton fill="outline" size="small" onClick={handleStopParse}>
                  <IonIcon icon={stopCircleOutline} slot="start" />
                  停止解析
                </IonButton>
              </div>
            </div>
          )}
          {phase === 'reviewing' && (
            <>
              {parsePhases.length > 0 && (
                <details className="quick-capture-process-trace">
                  <summary>查看解析过程（{parsePhases.length} 步）</summary>
                  <PhasesIndicator phases={parsePhases} loading={false} />
                </details>
              )}
              <div className="quick-capture-review-wrap">
                <ReviewSequence
                  initialEntries={entries}
                  rawTranscript={transcript}
                  pageDateEntries={pageDateEntries}
                  onBackToInput={() => setPhase('input')}
                  onAllDone={handleAllDone}
                />
              </div>
            </>
          )}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>完成</div>
          )}
        </div>
      </div>
    </IonModal>
  );
};
