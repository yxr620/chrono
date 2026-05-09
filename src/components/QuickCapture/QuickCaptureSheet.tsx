import React, { useState, useCallback } from 'react';
import { IonModal, IonIcon, IonButton } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useAppToast } from '../../hooks/useAppToast';
import { TranscriptInput } from './TranscriptInput';
import { ParsingView } from './ParsingView';
import { ReviewSequence } from './ReviewSequence';
import {
  loadParseContext,
  parseTranscript,
  type PendingEntry,
} from '../../services/quickCapture/quickCaptureParse';
import type { TimeEntry } from '../../services/db';
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
  const [recentEntries, setRecentEntries] = useState<TimeEntry[]>([]);
  const [present] = useAppToast();

  const reset = useCallback(() => {
    setPhase('input');
    setTranscript('');
    setEntries([]);
    setRecentEntries([]);
  }, []);

  const handleClose = () => {
    onDismiss();
    setTimeout(reset, 300);
  };

  const handleParse = async () => {
    const text = transcript.trim();
    if (!text) return;
    setPhase('parsing');
    try {
      const ctx = await loadParseContext(new Date());
      const result = await parseTranscript(text, ctx);
      setRecentEntries(ctx.recentEntries);
      setEntries(result.entries);
      setPhase('reviewing');
    } catch (err) {
      present({
        message: `解析失败：${err instanceof Error ? err.message : String(err)}`,
        duration: 2500,
        position: 'top',
        color: 'danger',
      });
      setPhase('input');
    }
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
            <TranscriptInput
              value={transcript}
              onChange={setTranscript}
              onSubmit={handleParse}
            />
          )}
          {phase === 'parsing' && <ParsingView />}
          {phase === 'reviewing' && (
            <ReviewSequence
              initialEntries={entries}
              rawTranscript={transcript}
              recentEntries={recentEntries}
              onBackToInput={() => setPhase('input')}
              onAllDone={handleAllDone}
            />
          )}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>完成</div>
          )}
        </div>
      </div>
    </IonModal>
  );
};
