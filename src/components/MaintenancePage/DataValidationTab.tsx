import React, { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { dataService, type OverlapPair, type Anomaly } from '../../services/dataService';
import { useEntryStore } from '../../stores/entryStore';
import { useCategoryStore } from '../../stores/categoryStore';

const canTrimEntryB = (pair: OverlapPair) => (
  pair.entryA.endTime !== null
  && pair.entryB.endTime !== null
  && new Date(pair.entryA.endTime).getTime() < new Date(pair.entryB.endTime).getTime()
);

export const DataValidationTab: React.FC = () => {
  const [overlaps, setOverlaps] = useState<OverlapPair[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [phase, setPhase] = useState<'idle' | 'results'>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const hasStartedInitialScan = useRef(false);

  const { loadEntries } = useEntryStore();
  const { getCategoryName } = useCategoryStore();

  const handleScan = useCallback(async () => {
    setIsLoading(true);
    try {
      const [o, a] = await Promise.all([
        dataService.entries.findOverlaps(),
        dataService.entries.findAnomalies(),
      ]);
      setOverlaps(o);
      setAnomalies(a);
      setPhase('results');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasStartedInitialScan.current) return;
    hasStartedInitialScan.current = true;
    void handleScan();
  }, [handleScan]);

  const handleTrimOverlap = async (pair: OverlapPair, target: 'A' | 'B') => {
    if (target === 'A') {
      await dataService.entries.update(pair.entryA.id!, {
        endTime: pair.entryB.startTime,
      });
    } else {
      if (!canTrimEntryB(pair)) return;
      await dataService.entries.update(pair.entryB.id!, {
        startTime: pair.entryA.endTime!,
      });
    }
    await loadEntries();
    await handleScan();
  };

  const handleDeleteEntry = async (id: string) => {
    const confirmed = window.confirm('确定要删除此记录吗？');
    if (!confirmed) return;

    await dataService.entries.delete(id);
    await loadEntries();
    setOverlaps(prev => prev.filter(p => p.entryA.id !== id && p.entryB.id !== id));
    setAnomalies(prev => prev.filter(a => a.entry.id !== id));
  };

  const formatEntry = (e: { startTime: Date; endTime: Date | null; activity: string; categoryId: string | null }) => {
    const start = dayjs(e.startTime).format('MM-DD HH:mm');
    const end = e.endTime ? dayjs(e.endTime).format('HH:mm') : '???';
    const cat = e.categoryId ? getCategoryName(e.categoryId) : '';
    return `${start}-${end} ${e.activity}${cat ? ` (${cat})` : ''}`;
  };

  if (isLoading) {
    return <div className="maintenance-loading">扫描中...</div>;
  }

  if (phase === 'idle') {
    return (
      <div>
        <button className="maintenance-btn maintenance-btn-primary" onClick={handleScan}>
          开始扫描
        </button>
      </div>
    );
  }

  const hasIssues = overlaps.length > 0 || anomalies.length > 0;

  return (
    <div>
      <button
        className="maintenance-btn maintenance-btn-secondary"
        onClick={handleScan}
        style={{ marginBottom: 16 }}
      >
        重新扫描
      </button>

      {!hasIssues && (
        <div className="validation-success">没有发现问题</div>
      )}

      {overlaps.length > 0 && (
        <div className="validation-section">
          <div className="validation-section-title">
            时间重叠 ({overlaps.length})
          </div>
          {overlaps.map((pair, i) => (
            <div key={i} className="validation-item">
              <div className="validation-item-header">
                重叠 {pair.overlapMinutes} 分钟
              </div>
              <div className="validation-item-detail">
                A: {formatEntry(pair.entryA)}<br />
                B: {formatEntry(pair.entryB)}
              </div>
              <div className="validation-item-actions">
                <button
                  className="btn-trim"
                  onClick={() => handleTrimOverlap(pair, 'A')}
                >
                  截断A至{dayjs(pair.entryB.startTime).format('HH:mm')}
                </button>
                <button
                  className="btn-trim"
                  onClick={() => handleTrimOverlap(pair, 'B')}
                  disabled={!canTrimEntryB(pair)}
                  title={canTrimEntryB(pair) ? undefined : 'A 已完全覆盖 B，无法截断 B'}
                >
                  截断B自{dayjs(pair.entryA.endTime).format('HH:mm')}
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDeleteEntry(pair.entryA.id!)}
                >
                  删除A
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDeleteEntry(pair.entryB.id!)}
                >
                  删除B
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {anomalies.length > 0 && (
        <div className="validation-section">
          <div className="validation-section-title">
            异常记录 ({anomalies.length})
          </div>
          {anomalies.map((anomaly, i) => (
            <div key={i} className="validation-item">
              <div className="validation-item-header">
                {anomaly.message}
              </div>
              <div className="validation-item-detail">
                {formatEntry(anomaly.entry)}
              </div>
              <div className="validation-item-actions">
                <button
                  className="btn-delete"
                  onClick={() => handleDeleteEntry(anomaly.entry.id!)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
