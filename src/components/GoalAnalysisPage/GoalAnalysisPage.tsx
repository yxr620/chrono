/**
 * 目标分析页面
 */
import React, { useState, useEffect, useCallback } from 'react';
import { IonSpinner, IonIcon } from '@ionic/react';
import {
  arrowBackOutline,
  calendarOutline,
  flagOutline,
  chevronForwardOutline,
  checkmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import dayjs from 'dayjs';
import {
  analyzeGoals,
  getDefaultGoalAnalysisDateRange,
  formatGoalDuration,
  formatGoalHours,
  getRelativeTimeDesc,
  getSubGoalDetails,
} from '../../services/analysis/goalAnalysisProcessor';
import { DEFAULT_CLUSTER_SETTINGS } from '../../services/analysis/goalCluster';
import {
  ANALYSIS_NEUTRAL_COLOR,
  getAnalysisClusterColor,
  getAnalysisClusterSurfaceTint,
  withAlpha,
} from '../../services/analysis/displayColors';
import { db } from '../../services/db';
import { syncDb } from '../../services/syncDb';
import type { TimeEntry } from '../../services/db';
import type {
  GoalAnalysisResult,
  ClusterStats,
  GoalCluster,
  UnlinkedEventSuggestion,
  SubGoalDetail,
  OverviewStats,
  GoalDistributionItem,
} from '../../types/goalAnalysis';
import type { DateRange } from '../../types/analysis';
import './GoalAnalysisPage.css';

const DATE_RANGES = [
  { label: '最近7天', days: 7 },
  { label: '最近30天', days: 30 },
  { label: '自定义', days: -1 },
];

const CHART_STYLES = {
  tooltip: {
    contentStyle: {
      backgroundColor: '#f8f3eb',
      border: '1px solid rgba(67, 51, 35, 0.1)',
      borderRadius: 14,
      boxShadow: '0 18px 38px -28px rgba(63, 43, 21, 0.36)',
      fontSize: 12,
      padding: 10,
      color: '#1d1712',
    },
  },
  axis: {
    tick: { fill: '#7f7264' },
    stroke: 'rgba(67, 51, 35, 0.16)',
  },
  grid: {
    stroke: 'rgba(67, 51, 35, 0.08)',
    strokeDasharray: '3 3',
    vertical: false as const,
  },
} as const;

const INITIAL_CLUSTER_COUNT = 10;
const DISTRIBUTION_LIMIT = 6;
const HEAT_WINDOW_DAYS = 7;
const RHYTHM_WINDOW_DAYS = 14;

type ClusterTone = {
  color: string;
  tint: string;
};

type ClusterHeatCell = {
  label: string;
  value: number;
  intensity: number;
};

type DistributionDisplayItem = GoalDistributionItem & ClusterTone;

type RhythmPoint = {
  label: string;
  [key: string]: string | number;
};

type RhythmLegendItem = {
  id: string;
  name: string;
  color: string;
};

interface GoalAnalysisPageProps {
  onBack?: () => void;
  dateRange?: DateRange;
  selectedRange?: number;
  onDateRangeChange?: (range: DateRange, selected: number) => void;
}

const filterEntriesForDateRange = (entries: TimeEntry[], dateRange: DateRange): TimeEntry[] => {
  const startTs = dayjs(dateRange.start).startOf('day').valueOf();
  const endTs = dayjs(dateRange.end).endOf('day').valueOf();

  return entries.filter((entry) => {
    if (entry.deleted || !entry.endTime) {
      return false;
    }

    const entryTs = new Date(entry.startTime).getTime();
    return entryTs >= startTs && entryTs <= endTs;
  });
};

const getRecentDayKeys = (dateRange: DateRange, windowDays: number): string[] => {
  const endDay = dayjs(dateRange.end).startOf('day');
  const candidateStart = endDay.subtract(windowDays - 1, 'day').startOf('day');
  const rangeStart = dayjs(dateRange.start).startOf('day');
  const startDay = rangeStart.isAfter(candidateStart) ? rangeStart : candidateStart;
  const totalDays = Math.max(1, endDay.diff(startDay, 'day') + 1);

  return Array.from({ length: totalDays }, (_unused, index) => (
    startDay.add(index, 'day').format('YYYY-MM-DD')
  ));
};

const buildGoalIdToClusterIdMap = (clusters: GoalCluster[]): Map<string, string> => {
  const goalIdToClusterId = new Map<string, string>();

  clusters.forEach((cluster) => {
    cluster.goalIds.forEach((goalId) => {
      goalIdToClusterId.set(goalId, cluster.id);
    });
  });

  return goalIdToClusterId;
};

const buildClusterToneMap = (distribution: GoalDistributionItem[]): Map<string, ClusterTone> => {
  const clusterToneMap = new Map<string, ClusterTone>();

  distribution.forEach((item, index) => {
    const color = item.color || getAnalysisClusterColor(item.clusterName, index);

    clusterToneMap.set(item.clusterId, {
      color,
      tint: withAlpha(color, 0.14),
    });
  });

  return clusterToneMap;
};

const buildDistributionDisplayItems = (
  distribution: GoalDistributionItem[],
  clusterToneMap: Map<string, ClusterTone>,
): DistributionDisplayItem[] => {
  const topItems = distribution.slice(0, DISTRIBUTION_LIMIT).map((item) => {
    const tone = clusterToneMap.get(item.clusterId);

    return {
      ...item,
      color: tone?.color ?? ANALYSIS_NEUTRAL_COLOR,
      tint: tone?.tint ?? withAlpha(ANALYSIS_NEUTRAL_COLOR, 0.14),
    };
  });

  if (distribution.length <= DISTRIBUTION_LIMIT) {
    return topItems;
  }

  const remainingItems = distribution.slice(DISTRIBUTION_LIMIT);
  const totalDuration = remainingItems.reduce((sum, item) => sum + item.totalDuration, 0);
  const percentage = remainingItems.reduce((sum, item) => sum + item.percentage, 0);

  return [
    ...topItems,
    {
      clusterId: '__other__',
      clusterName: `其他 (${remainingItems.length} 个)`,
      totalDuration,
      percentage,
      color: ANALYSIS_NEUTRAL_COLOR,
      tint: withAlpha(ANALYSIS_NEUTRAL_COLOR, 0.12),
    },
  ];
};

const buildClusterHeatMap = (
  entries: TimeEntry[],
  clusters: GoalCluster[],
  dateRange: DateRange,
): Record<string, ClusterHeatCell[]> => {
  const dayKeys = getRecentDayKeys(dateRange, HEAT_WINDOW_DAYS);
  const dayKeySet = new Set(dayKeys);
  const goalIdToClusterId = buildGoalIdToClusterIdMap(clusters);
  const durations = new Map<string, Map<string, number>>();

  entries.forEach((entry) => {
    if (!entry.goalId || !entry.endTime) {
      return;
    }

    const clusterId = goalIdToClusterId.get(entry.goalId);
    if (!clusterId) {
      return;
    }

    const dayKey = dayjs(entry.startTime).format('YYYY-MM-DD');
    if (!dayKeySet.has(dayKey)) {
      return;
    }

    const duration = Math.max(
      0,
      (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / (1000 * 60),
    );

    if (!durations.has(clusterId)) {
      durations.set(clusterId, new Map<string, number>());
    }

    const clusterDurations = durations.get(clusterId);
    if (!clusterDurations) {
      return;
    }

    clusterDurations.set(dayKey, (clusterDurations.get(dayKey) ?? 0) + duration);
  });

  const heatMap: Record<string, ClusterHeatCell[]> = {};

  clusters.forEach((cluster) => {
    const clusterDurations = durations.get(cluster.id);
    const values = dayKeys.map((dayKey) => clusterDurations?.get(dayKey) ?? 0);
    const maxValue = Math.max(...values, 1);

    heatMap[cluster.id] = dayKeys.map((dayKey, index) => ({
      label: dayjs(dayKey).format('MM/DD'),
      value: values[index],
      intensity: values[index] / maxValue,
    }));
  });

  return heatMap;
};

const buildRhythmModel = (
  entries: TimeEntry[],
  clusters: GoalCluster[],
  stats: ClusterStats[],
  dateRange: DateRange,
  clusterToneMap: Map<string, ClusterTone>,
): {
  data: RhythmPoint[];
  legend: RhythmLegendItem[];
} => {
  const activeClusters = stats
    .filter((stat) => stat.totalDuration > 0)
    .slice(0, 3)
    .map((stat) => clusters.find((cluster) => cluster.id === stat.clusterId))
    .filter((cluster): cluster is GoalCluster => Boolean(cluster));

  if (activeClusters.length === 0) {
    return { data: [], legend: [] };
  }

  const dayKeys = getRecentDayKeys(dateRange, RHYTHM_WINDOW_DAYS);
  const dayKeySet = new Set(dayKeys);
  const goalIdToClusterId = buildGoalIdToClusterIdMap(activeClusters);
  const pointsByDay = new Map<string, RhythmPoint>();

  dayKeys.forEach((dayKey) => {
    const point: RhythmPoint = { label: dayjs(dayKey).format('MM/DD') };
    activeClusters.forEach((cluster) => {
      point[cluster.id] = 0;
    });
    pointsByDay.set(dayKey, point);
  });

  entries.forEach((entry) => {
    if (!entry.goalId || !entry.endTime) {
      return;
    }

    const clusterId = goalIdToClusterId.get(entry.goalId);
    if (!clusterId) {
      return;
    }

    const dayKey = dayjs(entry.startTime).format('YYYY-MM-DD');
    if (!dayKeySet.has(dayKey)) {
      return;
    }

    const point = pointsByDay.get(dayKey);
    if (!point) {
      return;
    }

    const durationHours = Math.max(
      0,
      (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / (1000 * 60 * 60),
    );
    const previousValue = typeof point[clusterId] === 'number' ? point[clusterId] : 0;
    point[clusterId] = Math.round((previousValue + durationHours) * 10) / 10;
  });

  return {
    data: dayKeys.map((dayKey) => pointsByDay.get(dayKey) ?? { label: dayjs(dayKey).format('MM/DD') }),
    legend: activeClusters.map((cluster, index) => ({
      id: cluster.id,
      name: cluster.name,
      color: clusterToneMap.get(cluster.id)?.color
        ?? getAnalysisClusterColor(cluster.name, index),
    })),
  };
};

export const GoalAnalysisPage: React.FC<GoalAnalysisPageProps> = ({
  onBack,
  dateRange: dateRangeProp,
  selectedRange: selectedRangeProp,
  onDateRangeChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(dateRangeProp ?? getDefaultGoalAnalysisDateRange());
  const [selectedRange, setSelectedRange] = useState(selectedRangeProp ?? 30);
  const [analysisResult, setAnalysisResult] = useState<GoalAnalysisResult | null>(null);
  const [filteredEntries, setFilteredEntries] = useState<TimeEntry[]>([]);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [subGoalDetails, setSubGoalDetails] = useState<SubGoalDetail[]>([]);
  const [showAllClusters, setShowAllClusters] = useState(false);

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
      const [result, allEntries] = await Promise.all([
        analyzeGoals(dateRange, DEFAULT_CLUSTER_SETTINGS),
        db.entries.toArray(),
      ]);

      setAnalysisResult(result);
      setFilteredEntries(filterEntriesForDateRange(allEntries, dateRange));
      setExpandedClusterId(null);
      setSubGoalDetails([]);
      setShowAllClusters(false);
    } catch (error) {
      console.error('加载目标分析数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadSubGoalDetails = useCallback((cluster: GoalCluster) => {
    const details = getSubGoalDetails(cluster, filteredEntries);
    setSubGoalDetails(details);
  }, [filteredEntries]);

  const handleClusterClick = (cluster: GoalCluster) => {
    if (expandedClusterId === cluster.id) {
      setExpandedClusterId(null);
      setSubGoalDetails([]);
      return;
    }

    setExpandedClusterId(cluster.id);
    loadSubGoalDetails(cluster);
  };

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

  if (loading) {
    return (
      <div className="goal-editorial-page is-loading">
        <div className="goal-editorial-shell">
          <div className="goal-status-card">
            <IonSpinner name="crescent" />
            <h2>正在整理目标章节</h2>
            <p>读取目标、聚类和未关联记录后，这里会生成新的桌面目标分析页面。</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysisResult || analysisResult.clusters.length === 0) {
    return (
      <div className="goal-editorial-page">
        <div className="goal-editorial-shell">
          <div className="goal-page-header goal-page-header-editorial">
            <div className="goal-heading-group">
              {onBack && (
                <button className="goal-back-btn" onClick={onBack} type="button">
                  <IonIcon icon={arrowBackOutline} />
                </button>
              )}
              <div>
                <p className="goal-kicker">Chapter 02</p>
                <h1>目标深度分析</h1>
                <p className="goal-header-meta">读目标结构、聚类关系和待关联记录。</p>
              </div>
            </div>
            <DateRangeSelector
              selected={selectedRange}
              onChange={handleRangeChange}
              customRange={dateRange}
              onCustomRangeChange={handleCustomRangeChange}
            />
          </div>

          <div className="goal-status-card">
            <IonIcon icon={flagOutline} className="goal-status-icon" />
            <h2>这段时间还没有可阅读的目标结构</h2>
            <p>开始设置目标并记录时间后，这一章会显示目标分布、聚类列表以及近期节奏。</p>
          </div>
        </div>
      </div>
    );
  }

  const { clusters, stats, unlinkedSuggestions, overviewStats, distribution } = analysisResult;
  const clusterToneMap = buildClusterToneMap(distribution);
  const distributionDisplayItems = buildDistributionDisplayItems(distribution, clusterToneMap);
  const clusterHeatMap = buildClusterHeatMap(filteredEntries, clusters, dateRange);
  const rhythmModel = buildRhythmModel(filteredEntries, clusters, stats, dateRange, clusterToneMap);
  const visibleStats = showAllClusters ? stats : stats.slice(0, INITIAL_CLUSTER_COUNT);
  const totalGoalCount = clusters.reduce((sum, cluster) => sum + cluster.goals.length, 0);

  return (
    <div className="goal-editorial-page">
      <div className="goal-editorial-shell">
        <div className="goal-page-header goal-page-header-editorial">
          <div className="goal-heading-group">
            {onBack && (
              <button className="goal-back-btn" onClick={onBack} type="button">
                <IonIcon icon={arrowBackOutline} />
              </button>
            )}
            <div>
              <p className="goal-kicker">Chapter 02</p>
              <h1>目标深度分析</h1>
              <p className="goal-header-meta">
                {dayjs(dateRange.start).format('MM/DD')} - {dayjs(dateRange.end).format('MM/DD')} · {overviewStats.totalEntries} 条记录
              </p>
            </div>
          </div>
          <DateRangeSelector
            selected={selectedRange}
            onChange={handleRangeChange}
            customRange={dateRange}
            onCustomRangeChange={handleCustomRangeChange}
          />
        </div>

        <section className="goal-chapter-card">
          <EditorialMetricStrip stats={overviewStats} />

          <div className="goal-editorial-grid">
            <div className="goal-panel">
              <SectionHeader
                title="目标分布"
                subtitle="把目标群按照总投入时长排序，保留相对权重和集中度。"
              />
              <GoalDistributionPanel items={distributionDisplayItems} />
            </div>

            <div className="goal-panel">
              <SectionHeader
                title="目标聚类"
                subtitle={`共 ${clusters.length} 个聚类，覆盖 ${totalGoalCount} 个原始目标。`}
              />
              <div className="goal-cluster-list">
                {visibleStats.map((stat, index) => {
                  const cluster = clusters.find((item) => item.id === stat.clusterId);
                  if (!cluster) {
                    return null;
                  }

                  const fallbackColor = getAnalysisClusterColor(cluster.name, index);
                  const tone = clusterToneMap.get(cluster.id) ?? {
                    color: fallbackColor,
                    tint: getAnalysisClusterSurfaceTint(cluster.name, index, 0.14),
                  };

                  return (
                    <ClusterCard
                      key={cluster.id}
                      cluster={cluster}
                      stat={stat}
                      rank={index + 1}
                      isExpanded={expandedClusterId === cluster.id}
                      subGoalDetails={expandedClusterId === cluster.id ? subGoalDetails : []}
                      accentColor={tone.color}
                      accentTint={tone.tint}
                      heatCells={clusterHeatMap[cluster.id] ?? []}
                      onClick={() => handleClusterClick(cluster)}
                    />
                  );
                })}
              </div>

              {stats.length > INITIAL_CLUSTER_COUNT && (
                <button
                  className="goal-show-more-btn"
                  onClick={() => setShowAllClusters(!showAllClusters)}
                  type="button"
                >
                  {showAllClusters ? '收起聚类' : `显示更多 (${stats.length - INITIAL_CLUSTER_COUNT} 个)`}
                </button>
              )}
            </div>
          </div>

          <div className="goal-support-grid">
            <UnlinkedEventSection
              suggestions={unlinkedSuggestions}
              clusters={clusters}
              clusterToneMap={clusterToneMap}
              onRefresh={fetchData}
            />
            <ClusterRhythmPanel data={rhythmModel.data} legend={rhythmModel.legend} />
          </div>
        </section>
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
    <div className="goal-filters">
      <IonIcon icon={calendarOutline} className="goal-filter-icon" />
      {DATE_RANGES.map((range) => (
        <button
          key={range.days}
          type="button"
          className={`goal-range-btn ${selected === range.days ? 'active' : ''}`}
          onClick={() => onChange(range.days)}
        >
          {range.label}
        </button>
      ))}
      {selected === -1 && (
        <div className="goal-custom-range">
          <input
            type="date"
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

const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  compact?: boolean;
}> = ({ title, subtitle, compact = false }) => (
  <div className={`goal-section-header ${compact ? 'compact' : ''}`}>
    <div className="goal-section-title-row">
      <h2>{title}</h2>
      <span />
    </div>
    {subtitle && <p className="goal-section-subtitle">{subtitle}</p>}
  </div>
);

const EditorialMetricStrip: React.FC<{
  stats: OverviewStats;
}> = ({ stats }) => {
  const items = [
    {
      label: '总投入',
      value: formatGoalHours(stats.totalDuration),
      description: '目标相关时间总量。',
    },
    {
      label: '日均投入',
      value: formatGoalHours(stats.dailyAvgDuration),
      description: `按 ${stats.daysInRange} 天范围计算。`,
    },
    {
      label: '目标覆盖率',
      value: `${Math.round(stats.goalCoverageRate * 100)}%`,
      description: '已关联目标的时间占比。',
    },
    {
      label: '活跃聚类',
      value: `${stats.activeClusters}`,
      description: '在当前范围内有投入的目标群。',
    },
  ];

  return (
    <div className="goal-metric-strip">
      {items.map((item) => (
        <div key={item.label} className="goal-metric-card">
          <div className="goal-metric-label">{item.label}</div>
          <div className="goal-metric-value">{item.value}</div>
          <div className="goal-metric-description">{item.description}</div>
        </div>
      ))}
    </div>
  );
};

const GoalDistributionPanel: React.FC<{
  items: DistributionDisplayItem[];
}> = ({ items }) => {
  if (items.length === 0) {
    return <div className="goal-panel-empty">当前时间范围还没有可展示的目标分布。</div>;
  }

  const maxDuration = Math.max(...items.map((item) => item.totalDuration), 1);

  return (
    <div className="goal-distribution-list">
      {items.map((item) => (
        <div key={item.clusterId} className="goal-distribution-row">
          <div className="goal-distribution-name">{item.clusterName}</div>
          <div className="goal-distribution-track" style={{ backgroundColor: item.tint }}>
            <div
              className="goal-distribution-fill"
              style={{
                width: `${Math.min(100, (item.totalDuration / maxDuration) * 100)}%`,
                background: `linear-gradient(90deg, ${item.color}, ${item.color}CC)`,
              }}
            />
          </div>
          <div className="goal-distribution-value">{formatGoalHours(item.totalDuration)}</div>
        </div>
      ))}
    </div>
  );
};

const ClusterCard: React.FC<{
  cluster: GoalCluster;
  stat: ClusterStats;
  rank: number;
  isExpanded: boolean;
  subGoalDetails: SubGoalDetail[];
  accentColor: string;
  accentTint: string;
  heatCells: ClusterHeatCell[];
  onClick: () => void;
}> = ({
  cluster,
  stat,
  rank,
  isExpanded,
  subGoalDetails,
  accentColor,
  accentTint,
  heatCells,
  onClick,
}) => (
  <div className={`goal-cluster-card ${isExpanded ? 'expanded' : ''}`}>
    <button
      aria-controls={`goal-cluster-details-${cluster.id}`}
      aria-expanded={isExpanded}
      className="goal-cluster-button"
      onClick={onClick}
      type="button"
    >
      <div className="goal-cluster-rank">{String(rank).padStart(2, '0')}</div>
      <div className="goal-cluster-summary">
        <div className="goal-cluster-name-row">
          <span className="goal-cluster-name" style={{ color: accentColor }}>{cluster.name}</span>
          <span className="goal-cluster-hours">{formatGoalHours(stat.totalDuration)}</span>
        </div>
        <div className="goal-cluster-meta">
          {stat.activeDays}天 · {cluster.goals.length}个目标 · 最近 {getRelativeTimeDesc(stat.lastActiveDate)} · 连续最长 {stat.longestStreak}天
        </div>
        <div className="goal-cluster-heat">
          {heatCells.map((cell) => (
            <span
              key={cell.label}
              className="goal-cluster-heat-cell"
              style={{
                backgroundColor: cell.value > 0
                  ? withAlpha(accentColor, 0.18 + (cell.intensity * 0.56))
                  : 'rgba(67, 51, 35, 0.08)',
                boxShadow: cell.value > 0 ? `inset 0 0 0 1px ${withAlpha(accentColor, 0.18)}` : 'none',
              }}
              title={`${cell.label} · ${formatGoalHours(cell.value)}`}
            />
          ))}
        </div>
      </div>
      <IonIcon
        icon={chevronForwardOutline}
        className={`goal-cluster-arrow ${isExpanded ? 'rotated' : ''}`}
        style={{ color: accentColor }}
      />
    </button>

    {isExpanded && (
      <div id={`goal-cluster-details-${cluster.id}`} className="goal-cluster-details" style={{ backgroundColor: accentTint }}>
        {subGoalDetails.length === 0 ? (
          <div className="goal-detail-empty">当前时间范围内没有可展开的子目标时长明细。</div>
        ) : (
          <div className="goal-detail-list">
            {subGoalDetails.map((detail) => (
              <div key={detail.goalId} className="goal-detail-item">
                <div className="goal-detail-name">{detail.goalName}</div>
                <div className="goal-detail-meta">{detail.date} · {detail.entryCount} 条</div>
                <div className="goal-detail-duration">{formatGoalDuration(detail.duration)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);

const UnlinkedEventSection: React.FC<{
  suggestions: UnlinkedEventSuggestion[];
  clusters: GoalCluster[];
  clusterToneMap: Map<string, ClusterTone>;
  onRefresh: () => void;
}> = ({ suggestions, clusters, clusterToneMap, onRefresh }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(new Set());
  }, [suggestions]);

  const getBestCandidate = (suggestion: UnlinkedEventSuggestion) => {
    const cluster = clusters.find((item) => item.id === suggestion.suggestedClusterId);
    if (!cluster) {
      return null;
    }

    const suggestionDate = new Date(suggestion.date);
    const candidates = cluster.goals
      .map((goal) => ({
        goal,
        diff: Math.abs(dayjs(goal.date).diff(suggestionDate, 'day')),
      }))
      .filter((item) => item.diff <= 2)
      .sort((left, right) => left.diff - right.diff);

    return candidates[0]?.goal ?? null;
  };

  const handleLink = async (suggestion: UnlinkedEventSuggestion) => {
    const candidate = getBestCandidate(suggestion);
    if (!candidate?.id) {
      return;
    }

    try {
      await syncDb.entries.update(suggestion.entryId, { goalId: candidate.id });
      setDismissed((previous) => new Set(previous).add(suggestion.entryId));
      onRefresh();
    } catch (error) {
      console.error('关联失败:', error);
    }
  };

  const handleDismiss = (entryId: string) => {
    setDismissed((previous) => new Set(previous).add(entryId));
  };

  const visibleSuggestions = suggestions.filter((suggestion) => (
    !dismissed.has(suggestion.entryId) && getBestCandidate(suggestion) !== null
  ));

  return (
    <div className="goal-support-panel">
      <SectionHeader
        title="未关联事件建议"
        subtitle="优先提示日期接近且语义相近的记录。"
        compact
      />

      {visibleSuggestions.length === 0 ? (
        <div className="goal-panel-empty">当前没有需要处理的未关联建议。</div>
      ) : (
        <div className="goal-suggestion-list">
          {visibleSuggestions.slice(0, 4).map((suggestion) => {
            const candidate = getBestCandidate(suggestion);
            const tone = clusterToneMap.get(suggestion.suggestedClusterId);
            const accentColor = tone?.color ?? ANALYSIS_NEUTRAL_COLOR;
            const accentTint = tone?.tint ?? withAlpha(ANALYSIS_NEUTRAL_COLOR, 0.14);

            return (
              <div key={suggestion.entryId} className="goal-suggestion-item" style={{ backgroundColor: accentTint }}>
                <span className="goal-suggestion-accent" style={{ backgroundColor: accentColor }} />
                <div className="goal-suggestion-info">
                  <div className="goal-suggestion-activity">{suggestion.activity}</div>
                  <div className="goal-suggestion-meta">
                    <span>{suggestion.date}</span>
                    <span className="goal-suggestion-divider">·</span>
                    <span>{formatGoalDuration(suggestion.duration)}</span>
                  </div>
                  <div className="goal-suggestion-target">
                    建议关联到 <strong>{candidate?.name}</strong>
                    {candidate?.date && (
                      <span className="goal-suggestion-date" style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}>
                        {candidate.date}
                      </span>
                    )}
                  </div>
                </div>
                <div className="goal-suggestion-actions">
                  <button
                    className="goal-suggestion-btn link"
                    onClick={() => handleLink(suggestion)}
                    style={{ backgroundColor: accentColor }}
                    type="button"
                  >
                    <IonIcon icon={checkmarkOutline} />
                  </button>
                  <button
                    className="goal-suggestion-btn dismiss"
                    onClick={() => handleDismiss(suggestion.entryId)}
                    type="button"
                  >
                    <IonIcon icon={closeOutline} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ClusterRhythmPanel: React.FC<{
  data: RhythmPoint[];
  legend: RhythmLegendItem[];
}> = ({ data, legend }) => (
  <div className="goal-support-panel">
    <SectionHeader
      title="活动节奏"
      subtitle="追踪近两周内最活跃目标群的波动方式。"
      compact
    />

    {data.length === 0 || legend.length === 0 ? (
      <div className="goal-panel-empty">当前时间范围内还没有足够的数据来形成节奏线索。</div>
    ) : (
      <>
        <div className="goal-rhythm-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 4 }}>
              <CartesianGrid {...CHART_STYLES.grid} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, ...CHART_STYLES.axis.tick }}
                stroke={CHART_STYLES.axis.stroke}
              />
              <YAxis
                tick={{ fontSize: 11, ...CHART_STYLES.axis.tick }}
                stroke={CHART_STYLES.axis.stroke}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip
                content={(props) => {
                  const { active, payload, label } = props;
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  return (
                    <div style={CHART_STYLES.tooltip.contentStyle}>
                      <div style={{ marginBottom: 6, fontWeight: 600 }}>{label}</div>
                      {payload.map((item) => (
                        <div key={String(item.dataKey)} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: item.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ color: '#64584d', minWidth: 0 }}>{item.name}</span>
                          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{item.value}h</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {legend.map((item) => (
                <Line
                  key={item.id}
                  type="monotone"
                  dataKey={item.id}
                  name={item.name}
                  stroke={item.color}
                  strokeWidth={2.2}
                  dot={{ r: 2, fill: item.color, strokeWidth: 0 }}
                  activeDot={{ r: 4, stroke: '#f8f3eb', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="goal-rhythm-legend">
          {legend.map((item) => (
            <div key={item.id} className="goal-rhythm-legend-item">
              <span className="goal-rhythm-dot" style={{ backgroundColor: item.color }} />
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
);

export default GoalAnalysisPage;