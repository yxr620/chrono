import React, { useState } from 'react';
import { SleepBackfillTab } from './SleepBackfillTab';
import { DataValidationTab } from './DataValidationTab';
import { CategoryManagerTab } from './CategoryManagerTab';
import './MaintenancePage.css';

type TabId = 'sleep' | 'validation' | 'categories';

export const MaintenancePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('sleep');

  return (
    <div className="maintenance-page">
      <div className="maintenance-tab-bar">
        <button
          className={`maintenance-tab-btn ${activeTab === 'sleep' ? 'active' : ''}`}
          onClick={() => setActiveTab('sleep')}
        >
          睡觉补录
        </button>
        <button
          className={`maintenance-tab-btn ${activeTab === 'validation' ? 'active' : ''}`}
          onClick={() => setActiveTab('validation')}
        >
          数据校验
        </button>
        <button
          className={`maintenance-tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          类别管理
        </button>
      </div>
      {activeTab === 'sleep' && <SleepBackfillTab />}
      {activeTab === 'validation' && <DataValidationTab />}
      {activeTab === 'categories' && <CategoryManagerTab />}
    </div>
  );
};
