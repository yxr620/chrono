import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TimeEntryForm } from '../TimeTracker/TimeEntryForm';
import { TimelineView } from '../TimelineView/TimelineView';
import { EntryList } from '../EntryList/EntryList';
import { useDateStore } from '../../stores/dateStore';
import dayjs from 'dayjs';
import './RecordsPage.css';

const NEW_ENTRY_MOTION_LIFETIME_MS = 700;

export const RecordsPage: React.FC = () => {
  const selectedDateStr = useDateStore(state => state.selectedDate);
  const setSelectedDate = useDateStore(state => state.setSelectedDate);

  const selectedDate = useMemo(() => dayjs(selectedDateStr).toDate(), [selectedDateStr]);

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [animatedEntryId, setAnimatedEntryId] = useState<string | null>(null);
  const motionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => {
    if (motionTimerRef.current) {
      clearTimeout(motionTimerRef.current);
    }
  }, []);

  const handleEntryCreated = useCallback((entryId: string) => {
    if (motionTimerRef.current) {
      clearTimeout(motionTimerRef.current);
    }

    setAnimatedEntryId(entryId);
    motionTimerRef.current = setTimeout(() => {
      setAnimatedEntryId(currentId => currentId === entryId ? null : currentId);
      motionTimerRef.current = null;
    }, NEW_ENTRY_MOTION_LIFETIME_MS);
  }, []);

  if (isDesktop) {
    return (
      <div className="records-page">
        {/* 时间轴在顶部，全宽显示 */}
        <div className="records-section">
          <TimelineView
            selectedDate={selectedDate}
            onDateChange={(date) => setSelectedDate(date)}
            animatedEntryId={animatedEntryId}
          />
        </div>

        {/* 两栏布局：左侧表单，右侧记录列表 */}
        <div className="records-body-desktop">
          <div className="records-col-left">
            <div className="records-section form-section">
              <TimeEntryForm onEntryCreated={handleEntryCreated} />
            </div>
          </div>
          <div className="records-col-right">
            <div className="records-section">
              <EntryList selectedDate={selectedDate} animatedEntryId={animatedEntryId} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="records-page">
      {/* 顶部：时间记录表单 */}
      <div className="records-section form-section">
        <TimeEntryForm onEntryCreated={handleEntryCreated} />
      </div>

      {/* 24小时时间轴可视化 */}
      <div className="records-section">
        <TimelineView
          selectedDate={selectedDate}
          onDateChange={(date) => setSelectedDate(date)}
          animatedEntryId={animatedEntryId}
        />
      </div>

      {/* 当日记录列表 */}
      <div className="records-section">
        <EntryList selectedDate={selectedDate} animatedEntryId={animatedEntryId} />
      </div>
    </div>
  );
};
