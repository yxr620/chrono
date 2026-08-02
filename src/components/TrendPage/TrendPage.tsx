import React, { useState, useEffect, useCallback } from 'react';
import { IonSpinner, IonIcon } from '@ionic/react';
import { calendarOutline, analyticsOutline, arrowBackOutline } from 'ionicons/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';
import {
  loadRawData,
  processEntries,
  groupByDayAndCategory,
  groupByWeekAndCategory,
  getDefaultDateRange,
} from '../../services/analysis/processor';
import { getAnalysisDisplayColor } from '../../services/analysis/displayColors';
import type { ProcessedEntry, CategoryTrendDataPoint, DateRange } from '../../types/analysis';
import './TrendPage.css';

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
  cursor: {
    fill: 'rgba(67, 51, 35, 0.08)',
  },
} as const;

const DATE_RANGES = [
  { label: '最近7天', days: 7 },
  { label: '最近30天', days: 30 },
  { label: '自定义', days: -1 },
];

interface CategoryTrendData {
  data: CategoryTrendDataPoint[];
  categoryKeys: { id: string; name: string; color: string }[];
}

interface StackedAreaOverviewProps {
  data: CategoryTrendDataPoint[];
  categories: { id: string; name: string; color: string }[];
  className?: string;
}

interface TrendPageProps {
  onBack?: () => void;
  dateRange?: DateRange;
  selectedRange?: number;
  onDateRangeChange?: (range: DateRange, selected: number) => void;
}

export const TrendPage: React.FC<TrendPageProps> = ({
  onBack,
  dateRange: dateRangeProp,
  selectedRange: selectedRangeProp,
  onDateRangeChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(dateRangeProp ?? getDefaultDateRange());
  const [selectedRange, setSelectedRange] = useState(selectedRangeProp ?? 30);
  const [entries, setEntries] = useState<ProcessedEntry[]>([]);
  const [categoryTrendData, setCategoryTrendData] = useState<CategoryTrendData>({ data: [], categoryKeys: [] });
  const [weeklyComparisonData, setWeeklyComparisonData] = useState<CategoryTrendData>({ data: [], categoryKeys: [] });

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
      const { entries: rawEntries, goals, categories } = await loadRawData({ dateRange });
      const processed = processEntries(rawEntries, goals, categories, dateRange);
      setEntries(processed);
      setCategoryTrendData(groupByDayAndCategory(processed, dateRange, categories));

      const today = new Date();
      const todayWeekStart = dayjs(today).day(0).startOf('day');
      const todayDayOfWeek = today.getDay();
      // Keep comparisons on complete Sunday-Saturday windows so the latest column never mixes a partial week.
      const lastCompleteWeekStart = todayDayOfWeek === 6
        ? todayWeekStart
        : todayWeekStart.subtract(1, 'week');

      const weeks = [2, 1, 0].map(weeksAgo => {
        const start = lastCompleteWeekStart.subtract(weeksAgo, 'week');
        const end = start.day(6).endOf('day');
        return {
          start: start.toDate(),
          end: end.toDate(),
          label: `${start.format('MM/DD')}-${end.format('MM/DD')}`,
        };
      });

      const comparisonDateRange = {
        start: weeks[0].start,
        end: weeks[2].end,
      };
      const { entries: compEntries } = await loadRawData({ dateRange: comparisonDateRange });

      const compProcessed = processEntries(compEntries, goals, categories, comparisonDateRange);
      setWeeklyComparisonData(groupByWeekAndCategory(compProcessed, weeks, categories));
    } catch (error) {
      console.error('加载趋势数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const displayCategories = categoryTrendData.categoryKeys.map(category => ({
    ...category,
    displayColor: getAnalysisDisplayColor(category.id, category.color),
  }));

  const displayWeeklyCategories = weeklyComparisonData.categoryKeys.map(category => ({
    ...category,
    displayColor: getAnalysisDisplayColor(category.id, category.color),
  }));

  if (loading) {
    return (
      <div className="trend-editorial-page is-loading">
        <div className="trend-editorial-shell">
          <div className="trend-status-card">
            <IonSpinner name="crescent" />
            <h2>正在整理趋势章节</h2>
            <p>读取分类记录后，这里会展开更适合桌面阅读的类别趋势视图。</p>
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="trend-editorial-page">
        <div className="trend-editorial-shell">
          <div className="trend-page-header trend-page-header-editorial">
            <div className="trend-heading-group">
              {onBack && (
                <button className="trend-back-btn trend-back-btn-editorial" onClick={onBack} type="button">
                  <IonIcon icon={arrowBackOutline} />
                </button>
              )}
              <div>
                <p className="trend-kicker">Chapter 01</p>
                <h1>类别趋势分析</h1>
                <p className="trend-header-meta">观察不同类别在时间中的流动方式。</p>
              </div>
            </div>
            <DateRangeSelector
              selected={selectedRange}
              onChange={handleRangeChange}
              customRange={dateRange}
              onCustomRangeChange={handleCustomRangeChange}
            />
          </div>

          <div className="trend-status-card">
            <IonIcon icon={analyticsOutline} className="trend-status-icon" />
            <h2>这段时间还没有类别趋势</h2>
            <p>开始记录后，这一章会优先展示总体叠加趋势，再拆开看周度变化和单类别小图。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="trend-editorial-page">
      <div className="trend-editorial-shell">
        <div className="trend-page-header trend-page-header-editorial">
          <div className="trend-heading-group">
            {onBack && (
              <button className="trend-back-btn trend-back-btn-editorial" onClick={onBack} type="button">
                <IonIcon icon={arrowBackOutline} />
              </button>
            )}
            <div>
              <p className="trend-kicker">Chapter 01</p>
              <h1>类别趋势分析</h1>
              <p className="trend-header-meta">观察不同类别在时间中的流动方式。</p>
            </div>
          </div>
          <DateRangeSelector
            selected={selectedRange}
            onChange={handleRangeChange}
            customRange={dateRange}
            onCustomRangeChange={handleCustomRangeChange}
          />
        </div>

        <section className="trend-chapter-card">
          <SectionHeader title="总体叠加" />
          <StackedAreaOverview
            data={categoryTrendData.data}
            categories={displayCategories.map(category => ({ ...category, color: category.displayColor }))}
            className="trend-area-overview"
          />

          {weeklyComparisonData.data.length > 0 && (
            <div className="trend-editorial-grid">
              <div>
                <SectionHeader title="周度对比" subtitle="比较最近三个完整周的类别投入差异。" compact />
                <WeeklyCategoryGroupedChart
                  data={weeklyComparisonData.data}
                  categories={displayWeeklyCategories.map(category => ({ ...category, color: category.displayColor }))}
                />
              </div>

              <div>
                <SectionHeader title="变化摘要" subtitle="用简短注释帮助用户快速扫读本周变化。" compact />
                <WeeklySummary
                  data={weeklyComparisonData.data}
                  categories={displayWeeklyCategories.map(category => ({ ...category, color: category.displayColor }))}
                />
              </div>
            </div>
          )}

          <div className="trend-editorial-small-grid">
            {displayCategories.map(category => (
              <SingleCategoryChart
                key={category.id}
                categoryId={category.id}
                categoryName={category.name}
                categoryColor={category.displayColor}
                data={categoryTrendData.data}
              />
            ))}
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
    <div className="trend-filters">
      <IonIcon icon={calendarOutline} className="trend-filter-icon" />
      {DATE_RANGES.map(range => (
        <button
          key={range.days}
          type="button"
          className={`trend-range-btn ${selected === range.days ? 'active' : ''}`}
          onClick={() => onChange(range.days)}
        >
          {range.label}
        </button>
      ))}
      {selected === -1 && (
        <div className="trend-custom-range">
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
  <div className={`trend-section-header ${compact ? 'compact' : ''}`}>
    <div className="trend-section-title-row">
      <h2>{title}</h2>
      <span />
    </div>
    {subtitle && <p className="trend-section-subtitle">{subtitle}</p>}
  </div>
);

const StackedAreaOverview: React.FC<StackedAreaOverviewProps> = ({ data, categories, className }) => {
  const cardClass = className ? `${className} trend-chart-card` : 'trend-chart-card';

  return (
    <div className={cardClass}>
      <div className="trend-chart-wrapper" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid {...CHART_STYLES.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, ...CHART_STYLES.axis.tick }}
              stroke={CHART_STYLES.axis.stroke}
              interval="preserveStartEnd"
              tickFormatter={(value) => {
                const parts = (value as string).split('/');
                return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : (value as string);
              }}
            />
            <YAxis
              tick={{ fontSize: 10, ...CHART_STYLES.axis.tick }}
              stroke={CHART_STYLES.axis.stroke}
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={(value) => `${Math.round(Number(value))}`}
            />
            <Tooltip
              content={(props) => {
                const { active, payload, label } = props;
                if (!active || !payload || payload.length === 0) return null;

                const total = payload.reduce((sum, item) => sum + ((item.value as number) || 0), 0);

                return (
                  <div style={CHART_STYLES.tooltip.contentStyle}>
                    <div style={{ marginBottom: 6 }}>日期: {label}</div>
                    {payload.map(item => (
                      <div key={String(item.dataKey)} style={{ marginBottom: 4 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            backgroundColor: item.color,
                            borderRadius: 3,
                            marginRight: 6,
                          }}
                        />
                        {item.name}: {(item.value as number).toFixed(1)}h
                      </div>
                    ))}
                    <div style={{ marginTop: 6, fontWeight: 600 }}>总计: {total.toFixed(1)}h</div>
                  </div>
                );
              }}
            />
            {categories.map(category => (
              <Area
                key={category.id}
                type="monotone"
                dataKey={category.id}
                name={category.name}
                stackId="1"
                stroke={category.color}
                fill={category.color}
                fillOpacity={0.48}
                strokeWidth={2}
                dot={{ r: 2, stroke: '#f8f3eb', strokeWidth: 1 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#f8f3eb' }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const SingleCategoryChart: React.FC<{
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  data: CategoryTrendDataPoint[];
}> = ({ categoryId, categoryName, categoryColor, data }) => {
  const chartData = data.map(point => {
    const value = (point[categoryId] as number) || 0;
    return {
      label: point.label,
      value,
      percentageOfDay: (value / 24) * 100,
    };
  });

  const values = chartData.map(point => point.value);
  const avg = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div className="trend-chart-card">
      <div className="trend-chart-header">
        <div className="trend-chart-title">
          <span className="trend-chart-color-dot" style={{ backgroundColor: categoryColor }} />
          {categoryName}
        </div>
        <div className="trend-chart-stats">
          <span className="trend-stat">总计: <strong>{total.toFixed(1)}h</strong></span>
          <span className="trend-stat">均值: <strong>{avg.toFixed(1)}h</strong></span>
        </div>
      </div>
      <div className="trend-chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid {...CHART_STYLES.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, ...CHART_STYLES.axis.tick }}
              stroke={CHART_STYLES.axis.stroke}
              interval="preserveStartEnd"
              tickFormatter={(value) => {
                const parts = String(value).split('/');
                return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : String(value);
              }}
            />
            <YAxis
              tick={{ fontSize: 10, ...CHART_STYLES.axis.tick }}
              stroke={CHART_STYLES.axis.stroke}
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={(value) => `${Math.round(Number(value))}`}
            />
            <Tooltip
              content={(props) => {
                const { active, payload, label } = props;
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as { value: number; percentageOfDay?: number };
                const percent = point.percentageOfDay ?? 0;
                return (
                  <div style={{ ...CHART_STYLES.tooltip.contentStyle, minWidth: undefined }}>
                    <div style={{ marginBottom: 6 }}>日期: {label}</div>
                    <div>{categoryName}: {point.value.toFixed(1)} 小时 ({percent.toFixed(1)}%)</div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={avg} stroke={categoryColor} strokeDasharray="4 4" strokeOpacity={0.5} />
            <Line
              type="linear"
              dataKey="value"
              stroke={categoryColor}
              strokeWidth={2}
              dot={{ r: 2, fill: categoryColor, strokeWidth: 0 }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#f8f3eb' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const WeeklyCategoryGroupedChart: React.FC<{
  data: CategoryTrendDataPoint[];
  categories: { id: string; name: string; color: string }[];
}> = ({ data, categories }) => {
  const chartData = React.useMemo(() => {
    if (data.length === 0) {
      return {
        transformedData: [] as Array<Record<string, string | number>>,
        weekKeys: [] as Array<{ key: string; label: string; color: string }>,
      };
    }

    const weekPalette = ['#2f251d', '#8f7f6f', '#d4c4b5'];
    const weekKeys = data.map((point, index) => ({
      key: `week_${index}`,
      label: point.label,
      color: weekPalette[index] ?? '#d4c4b5',
    }));

    const transformedData = categories.map(category => {
      const item: Record<string, string | number> = { name: category.name, color: category.color };
      data.forEach((point, index) => {
        item[`week_${index}`] = point[category.id] || 0;
      });
      return item;
    });

    return { transformedData, weekKeys };
  }, [data, categories]);

  if (chartData.transformedData.length === 0) {
    return null;
  }

  return (
    <div className="trend-chart-card">
      <div className="trend-chart-wrapper" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData.transformedData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
            <CartesianGrid {...CHART_STYLES.grid} />
            <XAxis dataKey="name" tick={{ fontSize: 12, ...CHART_STYLES.axis.tick }} stroke={CHART_STYLES.axis.stroke} />
            <YAxis tick={{ fontSize: 12, ...CHART_STYLES.axis.tick }} stroke={CHART_STYLES.axis.stroke} />
            <Tooltip
              cursor={CHART_STYLES.cursor}
              content={(props) => {
                const { active, payload, label } = props;
                if (!active || !payload || payload.length === 0) return null;

                return (
                  <div style={{ ...CHART_STYLES.tooltip.contentStyle, minWidth: 150 }}>
                    <div style={{ marginBottom: 6, fontWeight: 600, color: String(payload[0]?.payload.color ?? '#1d1712') }}>{label}</div>
                    {payload.map((item, index) => (
                      <div key={String(item.dataKey)} style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              backgroundColor: item.color,
                              borderRadius: 2,
                              marginRight: 6,
                            }}
                          />
                          {chartData.weekKeys[index]?.label || item.name}
                        </span>
                        <span>{(item.value as number).toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
            {chartData.weekKeys.map(week => (
              <Bar key={week.key} dataKey={week.key} name={week.label} fill={week.color} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const WeeklySummary: React.FC<{
  data: CategoryTrendDataPoint[];
  categories: { id: string; name: string; color: string }[];
}> = ({ data, categories }) => {
  if (data.length < 2) {
    return null;
  }

  const currentWeek = data[data.length - 1];
  const prevWeek = data[data.length - 2];
  const categoryOrder = ['学习', '工作', '娱乐', '日常', '运动', '休息', '未分类'];

  const changes = categories
    .map(category => {
      const currentVal = (currentWeek[category.id] as number) || 0;
      const prevVal = (prevWeek[category.id] as number) || 0;
      const diff = currentVal - prevVal;
      return {
        ...category,
        currentVal,
        prevVal,
        diff,
      };
    })
    .sort((left, right) => {
      const leftIndex = categoryOrder.indexOf(left.name);
      const rightIndex = categoryOrder.indexOf(right.name);
      const resolvedLeft = leftIndex === -1 ? categoryOrder.length : leftIndex;
      const resolvedRight = rightIndex === -1 ? categoryOrder.length : rightIndex;
      return resolvedLeft - resolvedRight;
    });

  const getDiffClass = (diff: number) => {
    if (diff > 0) return 'positive';
    if (diff < 0) return 'negative';
    return 'neutral';
  };

  return (
    <div className="trend-chart-card trend-summary-card">
      <div className="trend-summary-scroll">
        <div className="trend-summary-list">
          {changes.map(item => (
            <div key={item.id} className="trend-summary-item">
              <div className="trend-summary-bar" style={{ backgroundColor: item.color }} />
              <div className="trend-summary-content">
                <div className="trend-summary-name">{item.name}</div>
                <div className="trend-summary-details">
                  本周 {item.currentVal.toFixed(1)}h
                  <span className="trend-summary-divider">|</span>
                  上周 {item.prevVal.toFixed(1)}h
                </div>
              </div>
              <div className={`trend-summary-diff ${getDiffClass(item.diff)}`}>
                {item.diff > 0 ? '+' : ''}{item.diff.toFixed(1)}h
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrendPage;
