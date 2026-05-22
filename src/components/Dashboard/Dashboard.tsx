import React, { useState, useEffect, useCallback } from 'react';
import { IonSpinner, IonIcon } from '@ionic/react';
import { calendarOutline, analyticsOutline, chatbubbleEllipsesOutline } from 'ionicons/icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import {
  loadRawData,
  processEntries,
  calculateMetrics,
  groupByCategory,
  groupByHour,
  formatDuration,
  getDefaultDateRange,
} from '../../services/analysis/processor';
import { analyzeGoals } from '../../services/analysis/goalAnalysisProcessor';
import { DEFAULT_CLUSTER_SETTINGS } from '../../services/analysis/goalCluster';
import {
  ANALYSIS_NEUTRAL_COLOR,
  getAnalysisDisplayColor,
  getAnalysisSurfaceTint,
} from '../../services/analysis/displayColors';
import type { GoalDistributionItem } from '../../types/goalAnalysis';
import type {
  ProcessedEntry,
  AnalysisMetrics,
  ChartDataPoint,
  DateRange,
} from '../../types/analysis';
import { db, type TimeEntry } from '../../services/db';
import { useDateStore } from '../../stores/dateStore';
import './Dashboard.css';

const CHART_STYLES = {
  tooltip: {
    contentStyle: {
      backgroundColor: '#f8f3eb',
      border: '1px solid rgba(67, 51, 35, 0.1)',
      borderRadius: 14,
      boxShadow: '0 18px 38px -28px rgba(63, 43, 21, 0.36)',
      color: '#1d1712',
      fontFamily: 'var(--app-number-family)',
      fontSize: 12,
      fontVariantNumeric: 'tabular-nums',
      padding: 10,
    },
  },
  axis: {
    tick: {
      fill: '#7f7264',
      fontFamily: 'var(--app-number-family)',
    },
    stroke: 'rgba(67, 51, 35, 0.16)',
  },
  grid: {
    stroke: 'rgba(67, 51, 35, 0.08)',
    strokeDasharray: '3 3',
  },
} as const;

const DATE_RANGES = [
  { label: '最近7天', days: 7 },
  { label: '最近30天', days: 30 },
  { label: '自定义', days: -1 },
];

type DisplayChartDataPoint = ChartDataPoint & {
  displayColor: string;
  tint?: string;
};

interface DashboardProps {
  onOpenTrend?: () => void;
  onOpenGoalAnalysis?: () => void;
  dateRange?: DateRange;
  selectedRange?: number;
  onDateRangeChange?: (range: DateRange, selected: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onOpenTrend,
  onOpenGoalAnalysis,
  dateRange: dateRangeProp,
  selectedRange: selectedRangeProp,
  onDateRangeChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(dateRangeProp ?? getDefaultDateRange());
  const [selectedRange, setSelectedRange] = useState(selectedRangeProp ?? 30);
  const [entries, setEntries] = useState<ProcessedEntry[]>([]);
  const [metrics, setMetrics] = useState<AnalysisMetrics | null>(null);
  const [goalSummaryData, setGoalSummaryData] = useState<GoalDistributionItem[]>([]);
  const [categoryData, setCategoryData] = useState<ChartDataPoint[]>([]);
  const [hourData, setHourData] = useState<ChartDataPoint[]>([]);
  const [recentMemos, setRecentMemos] = useState<TimeEntry[]>([]);
  const setSelectedDate = useDateStore(state => state.setSelectedDate);

  useEffect(() => {
    if (dateRangeProp) {
      setDateRange(dateRangeProp);
    }
  }, [dateRangeProp]);

  useEffect(() => {
    if (selectedRangeProp !== undefined) {
      setSelectedRange(selectedRangeProp);
    }
  }, [selectedRangeProp]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ entries: rawEntries, goals, categories }, goalAnalysis] = await Promise.all([
        loadRawData({ dateRange }),
        analyzeGoals(dateRange, DEFAULT_CLUSTER_SETTINGS),
      ]);
      const processed = processEntries(rawEntries, goals, categories);

      setEntries(processed);
      setMetrics(calculateMetrics(processed));
      setGoalSummaryData(goalAnalysis.distribution);
      setCategoryData(groupByCategory(processed, categories));
      setHourData(groupByHour(processed));
    } catch (error) {
      console.error('加载分析数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const load = async () => {
      const sevenDaysAgo = dayjs().subtract(7, 'day').startOf('day').toDate();
      const all = await db.entries
        .filter(e => !e.deleted && !!e.memo && (e.memo as string).trim().length > 0)
        .toArray();
      const recent = all
        .filter(e => new Date(e.startTime).getTime() >= sevenDaysAgo.getTime())
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 5);
      setRecentMemos(recent);
    };
    load();
  }, [dateRange]);

  const handleRangeChange = (days: number) => {
    setSelectedRange(days);
    if (days > 0) {
      const today = new Date();
      const end = dayjs(today).subtract(1, 'day').endOf('day').toDate();
      const start = dayjs(today).subtract(days, 'day').startOf('day').toDate();
      const range = { start, end };
      setDateRange(range);
      onDateRangeChange?.(range, days);
    } else {
      onDateRangeChange?.(dateRange, days);
    }
  };

  const handleCustomRangeChange = (range: DateRange) => {
    const normalizedRange = {
      start: dayjs(range.start).startOf('day').toDate(),
      end: dayjs(range.end).endOf('day').toDate(),
    };
    setDateRange(normalizedRange);
    onDateRangeChange?.(normalizedRange, selectedRange);
  };

  const goalLinkedDuration = entries.reduce((sum, entry) => sum + (entry.goalId ? entry.duration : 0), 0);
  const displayTopGoal = goalSummaryData[0]?.clusterName || metrics?.topGoal || '-';
  const goalCoverage = metrics && metrics.totalTime > 0
    ? Math.max(0, Math.round((goalLinkedDuration / metrics.totalTime) * 100))
    : 0;

  const categoryDisplayData: DisplayChartDataPoint[] = categoryData.map(item => ({
    ...item,
    displayColor: getAnalysisDisplayColor(undefined, item.color),
    tint: getAnalysisSurfaceTint(undefined, item.color, 0.16),
  }));

  const dashboardCategoryHighlights = categoryDisplayData.slice(0, 3);
  const goalDisplayData: DisplayChartDataPoint[] = goalSummaryData.slice(0, 4).map((item) => ({
    name: item.clusterName,
    value: item.totalDuration,
    displayColor: item.color,
  }));

  if (loading) {
    return (
      <div className="dashboard-page is-loading">
        <div className="dashboard-shell">
          <div className="dashboard-status-card">
            <IonSpinner name="crescent" className="dashboard-loading-spinner" />
            <h2>正在整理分析封面</h2>
            <p>读取记录、目标和类别数据后，这里会生成新的桌面分析首页。</p>
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-shell">
          <div className="dashboard-header dashboard-header-editorial">
            <div className="dashboard-heading-group">
              <p className="dashboard-kicker">Analysis</p>
              <h1>数据分析</h1>
              <p className="dashboard-header-meta">先选择时间范围，再让这里成为你的分析封面。</p>
            </div>
            <DateRangeSelector
              selected={selectedRange}
              onChange={handleRangeChange}
              customRange={dateRange}
              onCustomRangeChange={handleCustomRangeChange}
            />
          </div>

          <div className="dashboard-status-card">
            <IonIcon icon={analyticsOutline} className="dashboard-status-icon" />
            <h2>这段时间还没有可阅读的数据</h2>
            <p>开始记录时间后，首页会先呈现总投入，再把趋势和目标分析拆成两个章节页。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-shell">
        <div className="dashboard-header dashboard-header-editorial">
          <div className="dashboard-heading-group">
            <p className="dashboard-kicker">Analysis</p>
            <h1>数据分析</h1>
            <p className="dashboard-header-meta">
              {dayjs(dateRange.start).format('MM/DD')} - {dayjs(dateRange.end).format('MM/DD')} · {entries.length} 条记录
            </p>
          </div>
          <DateRangeSelector
            selected={selectedRange}
            onChange={handleRangeChange}
            customRange={dateRange}
            onCustomRangeChange={handleCustomRangeChange}
          />
        </div>

        <section className="dashboard-cover-card">
          <div className="dashboard-cover-main">
            <div className="dashboard-lead-band">
              <div className="dashboard-lead-value">{formatDuration(metrics?.totalTime ?? 0)}</div>
            </div>

            {metrics && <EditorialMetricStrip metrics={metrics} goalCoverage={goalCoverage} />}

            <div className="dashboard-summary-section">
              <SectionTitle title="时间分布摘要" />
              <p className="dashboard-summary-note">
                当前最集中的目标是 {displayTopGoal}，高频类别是 {metrics?.topCategory ?? '未分类'}。
              </p>
              <GoalSummaryBars data={goalDisplayData} />
            </div>
          </div>

          <aside className="dashboard-cover-side">
            <AnalysisEntryCard
              title="章节 01 · 类别趋势分析"
              description="查看类别总览、周度变化和单类别趋势。"
              accentColor={dashboardCategoryHighlights[0]?.displayColor ?? ANALYSIS_NEUTRAL_COLOR}
              onClick={onOpenTrend}
            />
            <AnalysisEntryCard
              title="章节 02 · 目标深度分析"
              description="查看目标分布、聚类结构、未关联事件和近期节奏。"
              accentColor={dashboardCategoryHighlights[1]?.displayColor ?? ANALYSIS_NEUTRAL_COLOR}
              onClick={onOpenGoalAnalysis}
            />

            <div className="dashboard-side-card">
              <SectionTitle title="类别摘要" compact />
              <CategoryDonutSummary data={categoryDisplayData} />
            </div>

            <div className="dashboard-side-card">
              <SectionTitle title="时段节奏" compact />
              <div className="dashboard-hour-chart">
                <HourDistributionChart data={hourData} />
              </div>
            </div>
          </aside>
        </section>

        {recentMemos.length > 0 && (
          <div className="dashboard-section dashboard-memo-card">
            <h3 className="dashboard-memo-title">
              <IonIcon icon={chatbubbleEllipsesOutline} aria-hidden="true" />
              最近感想
            </h3>
            <ul className="dashboard-memo-list">
              {recentMemos.map(e => (
                <li
                  key={e.id}
                  className="dashboard-memo-item"
                  onClick={() => {
                    setSelectedDate(dayjs(e.startTime).format('YYYY-MM-DD'));
                  }}
                >
                  <div className="dashboard-memo-meta">
                    {dayjs(e.startTime).format('MM-DD')} · {e.activity}
                  </div>
                  <div className="dashboard-memo-text">{e.memo}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const DateRangeSelector: React.FC<{
  selected: number;
  onChange: (days: number) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
}> = ({ selected, onChange, customRange, onCustomRangeChange }) => {
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div className="dashboard-filters">
      <IonIcon icon={calendarOutline} className="dashboard-filter-icon" />
      {DATE_RANGES.map(range => (
        <button
          key={range.days}
          type="button"
          className={`range-button ${selected === range.days ? 'active' : ''}`}
          onClick={() => onChange(range.days)}
        >
          {range.label}
        </button>
      ))}
      {selected === -1 && (
        <div className="dashboard-custom-range">
          <input
            type="date"
            className="date-input"
            value={formatDateForInput(customRange.start)}
            onChange={(event) => {
              const newStart = dayjs(event.target.value).startOf('day').toDate();
              if (!Number.isNaN(newStart.getTime()) && newStart <= customRange.end) {
                onCustomRangeChange({ ...customRange, start: newStart });
              }
            }}
          />
          <span>至</span>
          <input
            type="date"
            className="date-input"
            value={formatDateForInput(customRange.end)}
            onChange={(event) => {
              const newEnd = dayjs(event.target.value).endOf('day').toDate();
              if (!Number.isNaN(newEnd.getTime()) && newEnd >= customRange.start) {
                onCustomRangeChange({ ...customRange, end: newEnd });
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

const SectionTitle: React.FC<{ title: string; compact?: boolean }> = ({ title, compact = false }) => (
  <div className={`analysis-section-title ${compact ? 'compact' : ''}`}>
    <h2>{title}</h2>
    <span />
  </div>
);

const EditorialMetricStrip: React.FC<{
  metrics: AnalysisMetrics;
  goalCoverage: number;
}> = ({ metrics, goalCoverage }) => {
  const items = [
    {
      label: '日均投入',
      value: formatDuration(metrics.totalTime / Math.max(1, metrics.activeDays)),
      description: '过去一段时间平均每天的记录时长。',
    },
    {
      label: '目标覆盖率',
      value: `${goalCoverage}%`,
      description: '已绑定目标的时间占比。',
    },
    {
      label: '活跃天数',
      value: `${metrics.activeDays} 天`,
      description: '至少存在一条记录的日期数量。',
    },
  ];

  return (
    <div className="dashboard-metric-strip">
      {items.map(item => (
        <div key={item.label} className="dashboard-metric-card">
          <div className="dashboard-metric-label">{item.label}</div>
          <div className="dashboard-metric-value">{item.value}</div>
          <div className="dashboard-metric-description">{item.description}</div>
        </div>
      ))}
    </div>
  );
};

const GoalSummaryBars: React.FC<{
  data: DisplayChartDataPoint[];
}> = ({ data }) => {
  if (data.length === 0) {
    return <div className="dashboard-chart-empty">当前时间范围还没有可展示的目标摘要。</div>;
  }

  const maxValue = Math.max(...data.map(item => item.value), 1);

  return (
    <div className="dashboard-summary-bars">
      {data.map(item => (
        <div key={item.name} className="dashboard-summary-row">
          <div className="dashboard-summary-name">{item.name}</div>
          <div className="dashboard-summary-track">
            <div
              className="dashboard-summary-fill"
              style={{
                width: `${Math.min(100, (item.value / maxValue) * 100)}%`,
                background: `linear-gradient(90deg, ${item.displayColor}, ${item.displayColor}CC)`,
              }}
            />
          </div>
          <div className="dashboard-summary-value">{Math.round((item.value / 60) * 10) / 10}h</div>
        </div>
      ))}
    </div>
  );
};

const AnalysisEntryCard: React.FC<{
  title: string;
  description: string;
  accentColor: string;
  onClick?: () => void;
}> = ({ title, description, accentColor, onClick }) => (
  <button className="analysis-entry-card" onClick={onClick} type="button">
    <span className="analysis-entry-accent" style={{ backgroundColor: accentColor }} />
    <span className="analysis-entry-title" style={{ color: accentColor }}>{title}</span>
    <span className="analysis-entry-description">{description}</span>
    <span className="analysis-entry-action">阅读章节</span>
  </button>
);

const CategoryDonutSummary: React.FC<{
  data: DisplayChartDataPoint[];
}> = ({ data }) => {
  if (data.length === 0) {
    return <div className="dashboard-chart-empty">类别摘要会在有记录后出现在这里。</div>;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const totalHours = Math.round((total / 60) * 10) / 10;
  const topItems = data.slice(0, 4);
  const stops: string[] = [];
  let offset = 0;

  topItems.forEach(item => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    stops.push(`${item.displayColor} ${offset}% ${offset + percentage}%`);
    offset += percentage;
  });

  if (offset < 100) {
    stops.push(`#E7DCCF ${offset}% 100%`);
  }

  return (
    <div className="dashboard-category-summary">
      <div
        className="dashboard-category-ring"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
      >
        <div className="dashboard-category-ring-core">
          <strong>{totalHours}h</strong>
          <span>总类别</span>
        </div>
      </div>
      <div className="dashboard-category-legend">
        {topItems.map(item => (
          <div
            key={item.name}
            className="dashboard-category-legend-item"
            style={{ backgroundColor: item.tint }}
          >
            <div className="dashboard-category-legend-label">
              <span className="dashboard-category-dot" style={{ backgroundColor: item.displayColor }} />
              <span>{item.name}</span>
            </div>
            <span>{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const HourDistributionChart: React.FC<{ data: ChartDataPoint[] }> = ({ data }) => {
  if (data.length === 0) {
    return <div className="dashboard-chart-empty">时段节奏会在记录足够后显示。</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid {...CHART_STYLES.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, ...CHART_STYLES.axis.tick }}
          stroke={CHART_STYLES.axis.stroke}
          interval={1}
        />
        <YAxis
          tick={{ fontSize: 11, ...CHART_STYLES.axis.tick }}
          stroke={CHART_STYLES.axis.stroke}
          unit="h"
        />
        <Tooltip
          formatter={(value: number) => [`${value} 小时`, '时长']}
          {...CHART_STYLES.tooltip}
        />
        <Bar dataKey="value" fill={ANALYSIS_NEUTRAL_COLOR} radius={[8, 8, 0, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default Dashboard;
