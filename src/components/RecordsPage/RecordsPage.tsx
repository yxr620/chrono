import React, { useState, useEffect, useMemo } from 'react';
import { TimeEntryForm } from '../TimeTracker/TimeEntryForm';
import { TimelineView } from '../TimelineView/TimelineView';
import { EntryList } from '../EntryList/EntryList';
import { useDateStore } from '../../stores/dateStore';
import dayjs from 'dayjs';
import './RecordsPage.css';

export const RecordsPage: React.FC = () => {
  const selectedDateStr = useDateStore(state => state.selectedDate);
  const setSelectedDate = useDateStore(state => state.setSelectedDate);

  const selectedDate = useMemo(() => dayjs(selectedDateStr).toDate(), [selectedDateStr]);

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [memoOnly, setMemoOnly] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isDesktop) {
    return (
      <div className="records-page">
        {/* 时间轴在顶部，全宽显示 */}
        <div className="records-section">
          <TimelineView selectedDate={selectedDate} onDateChange={(date) => setSelectedDate(date)} />
        </div>

        {/* 两栏布局：左侧表单，右侧记录列表 */}
        <div className="records-body-desktop">
          <div className="records-col-left">
            <div className="records-section form-section">
              <TimeEntryForm />
            </div>
          </div>
          <div className="records-col-right">
            <div className="records-section">
              <div className="records-entry-list-wrap">
                <div className="records-memo-toggle-bar">
                  <span
                    onClick={() => setMemoOnly(v => !v)}
                    className={`records-memo-toggle ${memoOnly ? 'active' : ''}`}
                    role="button"
                    aria-pressed={memoOnly}
                  >
                    💭 {memoOnly ? '仅看感想 ✓' : '仅看感想'}
                  </span>
                </div>
                <EntryList selectedDate={selectedDate} memoOnly={memoOnly} />
              </div>
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
        <TimeEntryForm />
      </div>

      {/* 24小时时间轴可视化 */}
      <div className="records-section">
        <TimelineView selectedDate={selectedDate} onDateChange={(date) => setSelectedDate(date)} />
      </div>

      {/* 当日记录列表 */}
      <div className="records-section">
        <div className="records-entry-list-wrap">
          <div className="records-memo-toggle-bar">
            <span
              onClick={() => setMemoOnly(v => !v)}
              className={`records-memo-toggle ${memoOnly ? 'active' : ''}`}
              role="button"
              aria-pressed={memoOnly}
            >
              💭 {memoOnly ? '仅看感想 ✓' : '仅看感想'}
            </span>
          </div>
          <EntryList selectedDate={selectedDate} memoOnly={memoOnly} />
        </div>
      </div>
    </div>
  );
};
