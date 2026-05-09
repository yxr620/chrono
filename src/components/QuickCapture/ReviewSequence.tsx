import React, { useState, useRef } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { closeOutline, createOutline } from 'ionicons/icons';
import dayjs from 'dayjs';
import { ConfirmationCard } from '../AIAssistant/ConfirmationCard';
import { EditEntryModal } from './EditEntryModal';
import { addEntryAction } from '../../services/actions/write/addEntry';
import { detectConflicts } from '../../services/quickCapture/conflictDetection';
import type { PendingEntry, AddEntryParams } from '../../services/quickCapture/quickCaptureParse';
import type { ConfirmationCard as ConfirmCardType } from '../../services/actions/types';
import type { TimeEntry } from '../../services/db';
import './ReviewSequence.css';

interface Props {
  initialEntries: PendingEntry[];
  rawTranscript: string;
  recentEntries: TimeEntry[];
  onBackToInput: () => void;
  onAllDone: (savedCount: number, skippedCount: number, failedCount: number) => void;
}

export const ReviewSequence: React.FC<Props> = ({
  initialEntries,
  rawTranscript,
  recentEntries,
  onBackToInput,
  onAllDone,
}) => {
  const [entries, setEntries] = useState<PendingEntry[]>(initialEntries);
  const [confirmCards, setConfirmCards] = useState<Record<string, ConfirmCardType>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  // 同步追踪进行中的保存，防止"全部确认"和单条确认并发触发同一条 entry 的双重保存
  const inflightRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    // 预生成所有 confirm 卡，便于渲染
    let cancelled = false;
    (async () => {
      const out: Record<string, ConfirmCardType> = {};
      for (const e of entries) {
        if (!addEntryAction.confirm) continue;
        out[e.id] = await addEntryAction.confirm(e.params as unknown as Record<string, unknown>);
      }
      if (!cancelled) setConfirmCards(out);
    })();
    return () => { cancelled = true; };
  }, [entries]);

  const pendingIndexes = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.status === 'pending' || e.status === 'failed');

  const total = entries.length;
  const remainingCount = pendingIndexes.length;
  const savedCount = entries.filter(e => e.status === 'saved').length;
  const skippedCount = entries.filter(e => e.status === 'skipped').length;
  const failedCount = entries.filter(e => e.status === 'failed').length;

  const updateEntry = (id: string, patch: Partial<PendingEntry>) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  };

  const runAdd = async (entry: PendingEntry) => {
    if (inflightRef.current.has(entry.id)) return;
    inflightRef.current.add(entry.id);
    updateEntry(entry.id, { status: 'saving', error: undefined });
    try {
      const result = await addEntryAction.handler(entry.params as unknown as Record<string, unknown>);
      if (result.success) {
        updateEntry(entry.id, { status: 'saved' });
      } else {
        updateEntry(entry.id, { status: 'failed', error: result.message });
      }
    } catch (err) {
      updateEntry(entry.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inflightRef.current.delete(entry.id);
    }
  };

  const handleConfirm = async (entry: PendingEntry) => {
    await runAdd(entry);
  };

  const handleSkip = (entry: PendingEntry) => {
    updateEntry(entry.id, { status: 'skipped' });
  };

  const handleConfirmAll = async () => {
    // runAdd 自身用 inflightRef 防止重入；这里只需把当前可保存的条目串行跑一遍
    for (const { e } of pendingIndexes) {
      await runAdd(e);
    }
  };

  const handleEditSave = (id: string, next: AddEntryParams) => {
    const startDate = dayjs(`${next.date} ${next.start_time}`).toDate();
    const endDate = dayjs(`${next.date} ${next.end_time}`).toDate();
    const conflicts =
      isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate
        ? []
        : detectConflicts(startDate, endDate, recentEntries);

    setEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, params: next, conflicts, status: 'pending', error: undefined } : e)),
    );
    setEditingId(null);
  };

  const handleEditDelete = (id: string) => {
    updateEntry(id, { status: 'skipped' });
    setEditingId(null);
  };

  // 全部走完 → 通知父组件
  React.useEffect(() => {
    if (remainingCount === 0 && total > 0) {
      onAllDone(savedCount, skippedCount, failedCount);
    }
  }, [remainingCount, total, savedCount, skippedCount, failedCount, onAllDone]);

  if (total === 0) {
    return (
      <div className="review-sequence">
        <div className="review-done">
          AI 没有识别出可记录的活动
          <div style={{ marginTop: 12 }}>
            <IonButton fill="outline" size="small" onClick={onBackToInput}>
              返回重写
            </IonButton>
          </div>
        </div>
      </div>
    );
  }

  const editingEntry = editingId ? entries.find(e => e.id === editingId) : null;

  return (
    <div className="review-sequence">
      <div className="review-header">
        <div className="review-progress">
          已处理 {total - remainingCount} / {total}
        </div>
        {remainingCount > 1 && (
          <IonButton size="small" fill="outline" onClick={handleConfirmAll}>
            全部确认 ({remainingCount})
          </IonButton>
        )}
      </div>

      <div className="review-transcript" onClick={onBackToInput} title="点击返回重写">
        说的：{rawTranscript}
      </div>

      <div className="review-body">
        {entries.map(entry => {
          if (entry.status === 'saved' || entry.status === 'skipped' || entry.status === 'saving') return null;
          const card = confirmCards[entry.id];
          if (!card) return null;

          return (
            <div key={entry.id}>
              <ConfirmationCard
                card={card}
                onConfirm={() => handleConfirm(entry)}
                onCancel={() => handleSkip(entry)}
              />
              {entry.conflicts.length > 0 && (
                <div className="review-conflicts">
                  ⚠ 与已有记录重叠：
                  {entry.conflicts
                    .map(c => `${c.existingActivity}（${dayjs(c.overlapStart).format('HH:mm')}-${dayjs(c.overlapEnd).format('HH:mm')}）`)
                    .join('、')}
                </div>
              )}
              {entry.error && <div className="review-error">{entry.error}</div>}
              <div className="review-extra-actions">
                <IonButton size="small" fill="clear" onClick={() => setEditingId(entry.id)}>
                  <IonIcon slot="start" icon={createOutline} />
                  编辑
                </IonButton>
                <IonButton size="small" fill="clear" color="medium" onClick={() => handleSkip(entry)}>
                  <IonIcon slot="start" icon={closeOutline} />
                  跳过
                </IonButton>
              </div>
            </div>
          );
        })}
      </div>

      {editingEntry && (
        <EditEntryModal
          isOpen={!!editingId}
          initial={editingEntry.params}
          onSave={next => handleEditSave(editingEntry.id, next)}
          onDelete={() => handleEditDelete(editingEntry.id)}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
};
