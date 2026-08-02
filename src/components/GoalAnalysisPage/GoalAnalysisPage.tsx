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
import { clipTimeEntryToDateRange, splitIntervalByDay } from '../../services/analysis/processor';
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
      fontFamily: 'var(--app-number-family)',
      fontSize: 12,
      fontVariantNumeric: 'tabular-nums',
      padding: 10,
      color: '#1d1712',
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
    vertical: false as const,
  },
} as const;

const INITIAL_CLUSTER_COUNT = 10;
const DISTRIBUTION_LIMIT = 6;
const CLUSTER_TREND_WINDOW_DAYS = 14;

type ClusterTone = {
  color: string;
  tint: string;
};

type DistributionDisplayItem = GoalDistributionItem & ClusterTone;

type ClusterTrendPoint = {
  label: string;
  value: number;
};

interface GoalAnalysisPageProps {
  onBack?: () => void;
  dateRange?: DateRange;
  selectedRange?: number;
  onDateRangeChange?: (range: DateRange, selected: number) => void;
}

const filterEntriesForDateRange = (entries: TimeEntry[], dateRange: DateRange): TimeEntry[] => {
  const normalizedRange = {
    start: dayjs(dateRange.start).startOf('day').toDate(),
    end: dayjs(dateRange.end).endOf('day').toDate(),
  };

  return entries
    .map((entry) => (entry.deleted ? null : clipTimeEntryToDateRange(entry, normalizedRange)))
    .filter((entry): entry is TimeEntry => entry !== null);
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

const buildClusterTrend = (
  entries: TimeEntry[],
  cluster: GoalCluster,
  dateRange: DateRange,
): ClusterTrendPoint[] => {
  const dayKeys = getRecentDayKeys(dateRange, CLUSTER_TREND_WINDOW_DAYS);
  const dayKeySet = new Set(dayKeys);
  const goalIdSet = new Set(cluster.goalIds);
  const durations = new Map(dayKeys.map(dayKey => [dayKey, 0]));

  entries.forEach((entry) => {
    if (!entry.goalId || !entry.endTime || !goalIdSet.has(entry.goalId)) return;

    splitIntervalByDay(new Date(entry.startTime), new Date(entry.endTime)).forEach((segment) => {
      const dayKey = dayjs(segment.startTime).format('YYYY-MM-DD');
      if (dayKeySet.has(dayKey)) {
        durations.set(dayKey, (durations.get(dayKey) ?? 0) + (segment.duration / 60));
      }
    });
  });

  return dayKeys.map(dayKey => ({
    label: dayjs(dayKey).format('MM/DD'),
    value: durations.get(dayKey) ?? 0,
  }));
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
  const [clusterTrend, setClusterTrend] = useState<ClusterTrendPoint[]>([]);
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
      setClusterTrend([]);
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
    setClusterTrend(buildClusterTrend(filteredEntries, cluster, dateRange));
  }, [dateRange, filteredEntries]);

  const handleClusterClick = (cluster: GoalCluster) => {
    if (expandedClusterId === cluster.id) {
      setExpandedClusterId(null);
      setSubGoalDetails([]);
      setClusterTrend([]);
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
            <p>开始设置目标并记录时间后，这一章会显示目标投入分布和跨日主题。</p>
          </div>
        </div>
      </div>
    );
  }

  const { clusters, stats, unlinkedSuggestions, overviewStats, distribution } = analysisResult;
  const clusterToneMap = buildClusterToneMap(distribution);
  const distributionDisplayItems = buildDistributionDisplayItems(distribution, clusterToneMap);
  const visibleStats = showAllClusters ? stats : stats.slice(0, INITIAL_CLUSTER_COUNT);
  const totalGoalCount = stats.reduce((sum, stat) => sum + stat.activeGoalCount, 0);

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
                subtitle={`共 ${clusters.length} 个活跃聚类，包含 ${totalGoalCount} 个有投入目标。`}
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
                      trendData={expandedClusterId === cluster.id ? clusterTrend : []}
                      accentColor={tone.color}
                      accentTint={tone.tint}
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
  trendData: ClusterTrendPoint[];
  accentColor: string;
  accentTint: string;
  onClick: () => void;
}> = ({
  cluster,
  stat,
  rank,
  isExpanded,
  subGoalDetails,
  trendData,
  accentColor,
  accentTint,
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
          {stat.activeDays}天 · {stat.activeGoalCount}个目标 · {stat.entryCount}条记录 · 最近 {getRelativeTimeDesc(stat.lastActiveDate)}
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
        <ClusterTrendChart data={trendData} color={accentColor} />
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

const ClusterTrendChart: React.FC<{
  data: ClusterTrendPoint[];
  color: string;
}> = ({ data, color }) => (
  <div className="goal-cluster-trend">
    <div className="goal-cluster-detail-title">所选范围末 14 天投入变化</div>
    <div className="goal-cluster-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid {...CHART_STYLES.grid} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ fontSize: 11, ...CHART_STYLES.axis.tick }}
            stroke={CHART_STYLES.axis.stroke}
          />
          <YAxis
            width={44}
            tick={{ fontSize: 11, ...CHART_STYLES.axis.tick }}
            stroke={CHART_STYLES.axis.stroke}
            tickFormatter={(value) => `${value}h`}
          />
          <Tooltip
            content={(props) => {
              const { active, payload, label } = props;
              if (!active || !payload || payload.length === 0) return null;
              const value = Number(payload[0].value ?? 0);
              return (
                <div style={CHART_STYLES.tooltip.contentStyle}>
                  <div style={{ marginBottom: 4 }}>{label}</div>
                  <strong>{value.toFixed(1)}h</strong>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.2}
            dot={{ r: 2, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 4, stroke: '#f8f3eb', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
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

export default GoalAnalysisPage;
