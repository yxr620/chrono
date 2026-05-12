import React, { useEffect, useState, useMemo } from 'react';
import {
  IonIcon,
  IonList
} from '@ionic/react';
import { chatbubbleEllipsesOutline } from 'ionicons/icons';
import { useEntryStore } from '../../stores/entryStore';
import { useGoalStore } from '../../stores/goalStore';
import { useCategoryStore } from '../../stores/categoryStore';
import type { TimeEntry } from '../../services/db';
import { EditEntryDialog } from './EditEntryDialog';
import { SwipeableItem } from './SwipeableItem';
import dayjs from 'dayjs';
import './EntryList.css';

interface EntryListProps {
  selectedDate?: Date;
}

export const EntryList: React.FC<EntryListProps> = ({ selectedDate }) => {
  const { entries, loadEntries, deleteEntry, updateEntry, setNextStartTime } = useEntryStore();
  const { goals, loadGoals } = useGoalStore();
  const { loadCategories, getCategoryColor } = useCategoryStore();
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());

  const toggleMemoExpanded = (entryId: string) => {
    setExpandedMemos(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  useEffect(() => {
    loadEntries();
    loadGoals();
    loadCategories();
  }, [loadEntries, loadGoals, loadCategories]);

  // 按选定日期筛选记录，保留跨天记录
  const displayEntries = useMemo(() => {
    if (!selectedDate) return entries;

    const dayStart = dayjs(selectedDate).startOf('day');
    const dayEnd = dayjs(selectedDate).endOf('day');
    return entries.filter(entry => {
      const entryStart = dayjs(entry.startTime);
      const entryEnd = entry.endTime ? dayjs(entry.endTime) : dayjs();
      return entryStart.isBefore(dayEnd) && entryEnd.isAfter(dayStart);
    });
  }, [entries, selectedDate]);

  const formatDuration = (start: Date, end: Date | null) => {
    if (!end) return '进行中';

    const diff = dayjs(end).diff(dayjs(start), 'minute');
    return `${diff} 分钟`;
  };

  const formatTimeRange = (start: Date, end: Date | null) => {
    const startLabel = dayjs(start).format('HH:mm');
    const endLabel = end ? dayjs(end).format('HH:mm') : '进行中';

    return `${startLabel}-${endLabel}`;
  };

  // 根据goalId获取目标名称
  const getGoalName = (goalId: string | null) => {
    if (!goalId) return null;
    const goal = goals.find(g => g.id === goalId);
    return goal?.name || null;
  };

  return (
    <div className="entry-list-container">
      {displayEntries.length === 0 ? (
        <div className="entry-list-empty">暂无记录</div>
      ) : (
        <IonList>
          {displayEntries.map(entry => (
            <SwipeableItem
              key={`${entry.id}-${dayjs(entry.updatedAt).valueOf()}`}
              actions={[
                {
                  text: '编辑',
                  color: '#fff',
                  backgroundColor: 'hsl(var(--primary))',
                  onClick: () => setEditingEntry(entry),
                },
                {
                  text: '删除',
                  color: '#fff',
                  backgroundColor: '#ef4444',
                  onClick: async () => {
                    if (entry.id && window.confirm('确定要删除这条记录吗？')) {
                      await deleteEntry(entry.id);
                    }
                  },
                },
              ]}
            >
              <div
                className="entry-item"
                onClick={() => {
                  if (entry.endTime) {
                    setNextStartTime(entry.endTime);
                  }
                }}
              >
                <div className="entry-item-row">
                  <span
                    className="entry-color-dot"
                    style={{ backgroundColor: getCategoryColor(entry.categoryId) }}
                  />
                  <div className="entry-item-title-row">
                    <span className="entry-item-title">
                      {entry.activity}
                    </span>
                    {entry.memo && entry.id && (
                      <button
                        type="button"
                        className={`entry-item-memo-toggle${expandedMemos.has(entry.id) ? ' is-expanded' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMemoExpanded(entry.id!);
                        }}
                        aria-label={expandedMemos.has(entry.id) ? '收起备注' : '展开备注'}
                        aria-expanded={expandedMemos.has(entry.id)}
                      >
                        <IonIcon icon={chatbubbleEllipsesOutline} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="entry-item-meta">
                    {getGoalName(entry.goalId) && (
                      <span className="entry-goal-badge">
                        {getGoalName(entry.goalId)}
                      </span>
                    )}
                    <div className="entry-time-info">
                      <span className="entry-item-duration">{formatDuration(entry.startTime, entry.endTime)}</span>
                      <span className="entry-time-range">{formatTimeRange(entry.startTime, entry.endTime)}</span>
                    </div>
                  </div>
                </div>
                {entry.memo && entry.id && (
                  <div
                    className={`entry-item-memo-wrapper${expandedMemos.has(entry.id) ? ' is-expanded' : ''}`}
                    aria-hidden={!expandedMemos.has(entry.id)}
                  >
                    <span
                      className="entry-item-memo"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard?.writeText(entry.memo!);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        navigator.clipboard?.writeText(entry.memo!);
                      }}
                      title="点击/右键复制"
                    >
                      {entry.memo}
                    </span>
                  </div>
                )}
              </div>
            </SwipeableItem>
          ))}
        </IonList>
      )}

      <EditEntryDialog
        entry={editingEntry}
        visible={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        onSave={async (id, updates) => {
          await updateEntry(id, updates);
          setEditingEntry(null);
        }}
      />
    </div>
  );
};
