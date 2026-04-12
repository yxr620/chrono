# Analysis System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop analysis experience so Dashboard becomes a wide editorial cover page, TrendPage becomes a calmer category-trend chapter, and GoalAnalysisPage becomes a calmer goal-structure chapter with analysis-specific softened colors.

**Architecture:** Keep all existing analysis processors, shared date-range state, and routing intact. The implementation is mostly presentational: add one analysis-only display-color utility, then redesign the three analysis pages with a shared warm editorial system, wide desktop layout, and clearer color separation.

**Tech Stack:** React 18, TypeScript, Ionic React, colocated plain CSS, Recharts, Day.js, existing analysis processors in `src/services/analysis/`

---

## Working Notes

This repo has no automated tests for these pages. Use targeted ESLint plus manual desktop verification instead of test files.

Do not commit during implementation unless the user explicitly asks for commits. This repo-level instruction overrides the generic commit examples from the skill.

## File Map

### Create

- `src/services/analysis/displayColors.ts`
  Purpose: analysis-only display palette helper for softened category colors, alpha fills, and neutral/cluster fallback colors.

### Modify

- `src/components/Dashboard/Dashboard.tsx`
  Purpose: replace the conventional KPI-grid landing page with the approved wide editorial cover layout while keeping current data loading and chart data preparation.

- `src/components/Dashboard/Dashboard.css`
  Purpose: replace the current card-grid dashboard styling with the new warm editorial cover-page styling and wide desktop layout rules.

- `src/components/TrendPage/TrendPage.tsx`
  Purpose: keep current trend data logic while rebuilding the view into a chapter page that prioritizes chart readability and softened category colors.

- `src/components/TrendPage/TrendPage.css`
  Purpose: replace current dashboard-like trend styling with the new chapter-page layout and shared editorial surface treatment.

- `src/components/GoalAnalysisPage/GoalAnalysisPage.tsx`
  Purpose: keep goal clustering and linking logic while rebuilding the page into a calmer goal-structure chapter with top metric strip, two-column main body, and wide bottom support panels.

- `src/components/GoalAnalysisPage/GoalAnalysisPage.css`
  Purpose: replace the current compact card stack with the approved wide editorial chapter layout.

## Task 1: Add Analysis Display Color Utility

**Files:**
- Create: `src/services/analysis/displayColors.ts`
- Verify: `src/services/analysis/displayColors.ts`

- [ ] **Step 1: Create the analysis display palette helper**

Create `src/services/analysis/displayColors.ts` with this code:

```typescript
const ANALYSIS_PAPER_RGB = { r: 248, g: 243, b: 235 };

const PRESET_ANALYSIS_COLORS: Record<string, string> = {
  study: '#5C7FA3',
  work: '#7EA3B3',
  daily: '#C68D4E',
  exercise: '#C77459',
  rest: '#7C6AA4',
  entertainment: '#9C82B1',
};

export const ANALYSIS_NEUTRAL_COLOR = '#B5A896';

export const ANALYSIS_CLUSTER_PALETTE = [
  '#5C7FA3',
  '#7EA3B3',
  '#C68D4E',
  '#C77459',
  '#7C6AA4',
  '#9C82B1',
  '#8F7F6F',
  '#B5A896',
];

type Rgb = { r: number; g: number; b: number };

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const hexToRgb = (hex: string): Rgb | null => {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: Rgb): string => {
  const toHex = (channel: number) => clampChannel(channel).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mixRgb = (base: Rgb, target: Rgb, amount: number): Rgb => ({
  r: base.r + (target.r - base.r) * amount,
  g: base.g + (target.g - base.g) * amount,
  b: base.b + (target.b - base.b) * amount,
});

export const withAlpha = (hex: string, alpha: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(181, 168, 150, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

export const softenAnalysisColor = (hex: string, paperMix = 0.32): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return ANALYSIS_NEUTRAL_COLOR;

  const mixed = mixRgb(rgb, ANALYSIS_PAPER_RGB, paperMix);
  return rgbToHex(mixed);
};

export const getAnalysisDisplayColor = (categoryId?: string | null, rawColor?: string | null): string => {
  if (categoryId && PRESET_ANALYSIS_COLORS[categoryId]) {
    return PRESET_ANALYSIS_COLORS[categoryId];
  }

  if (rawColor) {
    return softenAnalysisColor(rawColor);
  }

  return ANALYSIS_NEUTRAL_COLOR;
};

export const getAnalysisSurfaceTint = (categoryId?: string | null, rawColor?: string | null, alpha = 0.14): string => {
  return withAlpha(getAnalysisDisplayColor(categoryId, rawColor), alpha);
};
```

- [ ] **Step 2: Run a targeted lint check for the new utility**

Run:

```bash
npx eslint src/services/analysis/displayColors.ts
```

Expected: command exits with code `0` and prints no lint errors.

## Task 2: Rebuild Dashboard Markup Into the Editorial Cover Layout

**Files:**
- Modify: `src/components/Dashboard/Dashboard.tsx`
- Verify: `src/components/Dashboard/Dashboard.tsx`, `src/services/analysis/displayColors.ts`

- [ ] **Step 1: Update imports and derive display colors for analysis summaries**

At the top of `src/components/Dashboard/Dashboard.tsx`, remove the `IonCard` import and add the display-color helper import:

```typescript
import { IonSpinner, IonIcon } from '@ionic/react';
import {
  ANALYSIS_NEUTRAL_COLOR,
  getAnalysisDisplayColor,
  getAnalysisSurfaceTint,
} from '../../services/analysis/displayColors';
```

Inside `Dashboard`, add derived display data right after `displayTopGoal`:

```typescript
  const goalCoverage = metrics && metrics.totalTime > 0
    ? Math.max(0, Math.round((1 - ((noGoalStat?.value ?? 0) / metrics.totalTime)) * 100))
    : 0;

  const categoryDisplayData = categoryData.map(item => ({
    ...item,
    displayColor: getAnalysisDisplayColor(undefined, item.color),
    tint: getAnalysisSurfaceTint(undefined, item.color, 0.16),
  }));

  const dashboardCategoryHighlights = categoryDisplayData.slice(0, 3);

  const goalDisplayData = goalsForChart.slice(0, 4).map((item, index) => ({
    ...item,
    displayColor: categoryDisplayData[index]?.displayColor ?? ANALYSIS_NEUTRAL_COLOR,
  }));
```

- [ ] **Step 2: Replace the current dashboard return markup with the approved cover layout**

Replace the current non-empty return block with this structure:

```tsx
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
              <div className="dashboard-lead-copy">
                <span className="dashboard-lead-label">Lead Metric</span>
                <p>这一页是分析系统的封面，先回答“这段时间总共投入了多少”，再进入趋势与目标两个章节。</p>
              </div>
            </div>

            {metrics && <EditorialMetricStrip metrics={metrics} goalCoverage={goalCoverage} />}

            <div className="dashboard-summary-section">
              <SectionTitle title="时间分布摘要" />
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
              description="查看目标分布、聚类结构、未关联事件和节奏。"
              accentColor={dashboardCategoryHighlights[1]?.displayColor ?? ANALYSIS_NEUTRAL_COLOR}
              onClick={onOpenGoalAnalysis}
            />

            <div className="dashboard-side-card">
              <SectionTitle title="类别摘要" compact />
              <CategoryDonutSummary data={categoryDisplayData} />
            </div>

            <div className="dashboard-side-card">
              <SectionTitle title="时段节奏" compact />
              <HourDistributionChart data={hourData} />
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
```

- [ ] **Step 3: Add the local helper components used by the new Dashboard layout**

Add these helper components below `DateRangeSelector` in the same file:

```tsx
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
  data: Array<ChartDataPoint & { displayColor: string }>;
}> = ({ data }) => (
  <div className="dashboard-summary-bars">
    {data.map(item => (
      <div key={item.name} className="dashboard-summary-row">
        <div className="dashboard-summary-name">{item.name}</div>
        <div className="dashboard-summary-track">
          <div
            className="dashboard-summary-fill"
            style={{
              width: `${Math.min(100, (item.value / Math.max(data[0]?.value || 1, 1)) * 100)}%`,
              background: `linear-gradient(90deg, ${item.displayColor}, ${item.displayColor}CC)`,
            }}
          />
        </div>
        <div className="dashboard-summary-value">{Math.round((item.value / 60) * 10) / 10}h</div>
      </div>
    ))}
  </div>
);

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
  </button>
);

const CategoryDonutSummary: React.FC<{
  data: Array<ChartDataPoint & { displayColor: string }>;
}> = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
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
      />
      <div className="dashboard-category-legend">
        {topItems.map(item => (
          <div key={item.name} className="dashboard-category-legend-item">
            <span className="dashboard-category-dot" style={{ backgroundColor: item.displayColor }} />
            <span>{item.name} {total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run a targeted lint check for the Dashboard TypeScript changes**

Run:

```bash
npx eslint src/components/Dashboard/Dashboard.tsx src/services/analysis/displayColors.ts
```

Expected: command exits with code `0` and prints no lint errors.

## Task 3: Replace Dashboard CSS With the Wide Editorial Cover Styling

**Files:**
- Modify: `src/components/Dashboard/Dashboard.css`
- Verify: `src/components/Dashboard/Dashboard.tsx`, `src/components/Dashboard/Dashboard.css`

- [ ] **Step 1: Replace the current Dashboard stylesheet with the editorial shell classes**

Replace `src/components/Dashboard/Dashboard.css` with these core layout rules:

```css
.dashboard-page {
  padding: 24px 28px 40px;
  background: linear-gradient(180deg, #efe7dc 0%, #f4ede4 100%);
}

.dashboard-shell {
  max-width: 1560px;
  margin: 0 auto;
}

.dashboard-header-editorial {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.dashboard-kicker {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #95897c;
  font-weight: 700;
}

.dashboard-header-editorial h1 {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 3rem;
  font-weight: 400;
  line-height: 0.95;
}

.dashboard-cover-card {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.92fr);
  gap: 28px;
  padding: 28px;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 28px;
  box-shadow: 0 30px 80px -52px rgba(63, 43, 21, 0.34);
}

.dashboard-lead-band {
  display: flex;
  align-items: flex-end;
  gap: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(67, 51, 35, 0.1);
}

.dashboard-lead-value {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: clamp(4.8rem, 10vw, 7.4rem);
  line-height: 0.85;
  letter-spacing: -0.05em;
  color: #1d1712;
}

.dashboard-metric-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.analysis-entry-card {
  display: block;
  width: 100%;
  padding: 18px;
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.34);
  text-align: left;
  cursor: pointer;
}

.analysis-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.analysis-section-title h2 {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 1.6rem;
  font-weight: 400;
}

.analysis-section-title span {
  flex: 1;
  height: 1px;
  background: rgba(67, 51, 35, 0.1);
}

@media (max-width: 1240px) {
  .dashboard-cover-card {
    grid-template-columns: 1fr;
  }

  .dashboard-metric-strip {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Add the summary, side rail, and chart support rules that match the new markup**

Append these supporting rules to the same stylesheet:

```css
.dashboard-summary-bars,
.dashboard-cover-side,
.dashboard-category-summary,
.dashboard-category-legend,
.dashboard-category-legend-item {
  display: flex;
}

.dashboard-summary-bars {
  flex-direction: column;
  gap: 14px;
}

.dashboard-summary-row {
  display: grid;
  grid-template-columns: 110px 1fr 64px;
  gap: 12px;
  align-items: center;
}

.dashboard-summary-track {
  height: 24px;
  border-radius: 6px;
  background: #ede3d6;
  overflow: hidden;
}

.dashboard-summary-fill {
  height: 100%;
  border-radius: 6px;
}

.dashboard-cover-side {
  flex-direction: column;
  gap: 18px;
}

.dashboard-side-card {
  padding: 18px;
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.3);
}

.dashboard-category-summary {
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.dashboard-category-ring {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  mask: radial-gradient(circle at center, transparent 42px, black 43px);
}

.dashboard-category-legend {
  flex-direction: column;
  gap: 10px;
}

.dashboard-category-legend-item {
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #60564c;
}

.dashboard-category-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
```

- [ ] **Step 3: Run a targeted lint/diagnostic pass on the Dashboard files**

Run:

```bash
npx eslint src/components/Dashboard/Dashboard.tsx src/services/analysis/displayColors.ts
```

Expected: command exits with code `0`.

## Task 4: Rebuild TrendPage Markup Into the Calmer Chapter Layout

**Files:**
- Modify: `src/components/TrendPage/TrendPage.tsx`
- Verify: `src/components/TrendPage/TrendPage.tsx`, `src/services/analysis/displayColors.ts`

- [ ] **Step 1: Import the display-color utility and derive display categories once**

At the top of `src/components/TrendPage/TrendPage.tsx`, add:

```typescript
import { getAnalysisDisplayColor } from '../../services/analysis/displayColors';
```

Inside `TrendPage`, right before the loading guard, add:

```typescript
  const displayCategories = categoryTrendData.categoryKeys.map(category => ({
    ...category,
    displayColor: getAnalysisDisplayColor(category.id, category.color),
  }));

  const displayWeeklyCategories = weeklyComparisonData.categoryKeys.map(category => ({
    ...category,
    displayColor: getAnalysisDisplayColor(category.id, category.color),
  }));
```

- [ ] **Step 2: Replace the current non-empty TrendPage layout with the chapter layout shell**

Replace the current non-empty return block with this structure:

```tsx
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
          <SectionHeader
            title="总体叠加"
            subtitle="趋势页进入更冷静的阅读模式，视觉权重让给图表本身。"
          />
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
```

- [ ] **Step 3: Add a reusable section header helper inside TrendPage**

Add this helper near the subcomponents in the same file:

```tsx
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
```

- [ ] **Step 4: Run a targeted lint check for the Trend TypeScript changes**

Run:

```bash
npx eslint src/components/TrendPage/TrendPage.tsx src/services/analysis/displayColors.ts
```

Expected: command exits with code `0`.

## Task 5: Replace TrendPage CSS With the Editorial Chapter Styling

**Files:**
- Modify: `src/components/TrendPage/TrendPage.css`
- Verify: `src/components/TrendPage/TrendPage.tsx`, `src/components/TrendPage/TrendPage.css`

- [ ] **Step 1: Replace the outer page and chapter shell classes**

Replace the top-level page styling in `src/components/TrendPage/TrendPage.css` with:

```css
.trend-editorial-page {
  padding: 24px 28px 40px;
  background: linear-gradient(180deg, #efe7dc 0%, #f4ede4 100%);
}

.trend-editorial-shell {
  max-width: 1600px;
  margin: 0 auto;
}

.trend-page-header-editorial {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

.trend-heading-group {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.trend-kicker {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #95897c;
  font-weight: 700;
}

.trend-page-header-editorial h1 {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 2.7rem;
  line-height: 0.96;
  font-weight: 400;
}

.trend-chapter-card {
  padding: 24px;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 28px;
  box-shadow: 0 30px 80px -52px rgba(63, 43, 21, 0.34);
}

.trend-editorial-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
  gap: 22px;
  margin-top: 20px;
}

.trend-editorial-small-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 22px;
}
```

- [ ] **Step 2: Add the shared chapter section styles and retone the cards**

Append these support rules:

```css
.trend-section-header {
  margin-bottom: 16px;
}

.trend-section-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trend-section-title-row h2 {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 1.7rem;
  font-weight: 400;
}

.trend-section-title-row span {
  flex: 1;
  height: 1px;
  background: rgba(67, 51, 35, 0.1);
}

.trend-section-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #95897c;
}

.trend-chart-card {
  background: rgba(255, 255, 255, 0.26);
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 18px;
  padding: 18px;
}

.trend-summary-item {
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(67, 51, 35, 0.08);
}

@media (max-width: 1240px) {
  .trend-editorial-grid,
  .trend-editorial-small-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Run a targeted lint/diagnostic pass on the Trend files**

Run:

```bash
npx eslint src/components/TrendPage/TrendPage.tsx src/services/analysis/displayColors.ts
```

Expected: command exits with code `0`.

## Task 6: Rebuild GoalAnalysisPage Markup Into the Goal Chapter Layout

**Files:**
- Modify: `src/components/GoalAnalysisPage/GoalAnalysisPage.tsx`
- Verify: `src/components/GoalAnalysisPage/GoalAnalysisPage.tsx`, `src/services/analysis/displayColors.ts`

- [ ] **Step 1: Import the cluster palette and replace the fixed bright cluster colors**

At the top of `src/components/GoalAnalysisPage/GoalAnalysisPage.tsx`, change the helper import to:

```typescript
import {
  ANALYSIS_CLUSTER_PALETTE,
  ANALYSIS_NEUTRAL_COLOR,
  getAnalysisSurfaceTint,
} from '../../services/analysis/displayColors';
```

Inside `ClusterCard`, replace the current `colors` array with:

```typescript
  const color = ANALYSIS_CLUSTER_PALETTE[index % ANALYSIS_CLUSTER_PALETTE.length] ?? ANALYSIS_NEUTRAL_COLOR;
```

- [ ] **Step 2: Replace the current goal-page return block with the chapter layout shell**

Replace the current non-empty `return` block with this structure:

```tsx
  return (
    <div className="goal-editorial-page">
      <div className="goal-editorial-shell">
        <div className="goal-analysis-header goal-analysis-header-editorial">
          <div className="goal-heading-group">
            {onBack && (
              <button className="goal-back-btn goal-back-btn-editorial" onClick={onBack} type="button">
                <IonIcon icon={arrowBackOutline} />
              </button>
            )}
            <div>
              <p className="goal-kicker">Chapter 02</p>
              <h1>目标深度分析</h1>
              <p className="goal-header-meta">观察目标群集中度、结构关系和近期节奏。</p>
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
          <CompactGoalMetrics stats={overviewStats} />

          <div className="goal-main-grid">
            <div>
              <SectionTitle title="目标分布" subtitle="横向条形更适合章节页阅读。" />
              <GoalDistributionChart distribution={distribution} />
            </div>

            <div>
              <SectionTitle
                title="目标聚类"
                subtitle={`共 ${clusters.length} 个聚类，${clusters.reduce((sum, cluster) => sum + cluster.goals.length, 0)} 个原始目标。`}
              />
              <div className="cluster-list cluster-list-editorial">
                {(showAllClusters ? stats : stats.slice(0, INITIAL_CLUSTER_COUNT)).map((stat, index) => {
                  const cluster = clusters.find(item => item.id === stat.clusterId)!;
                  const isExpanded = expandedClusterId === cluster.id;

                  return (
                    <ClusterCard
                      key={cluster.id}
                      cluster={cluster}
                      stat={stat}
                      index={index}
                      isExpanded={isExpanded}
                      subGoalDetails={isExpanded ? subGoalDetails : []}
                      onClick={() => handleClusterClick(cluster)}
                    />
                  );
                })}
              </div>
              {stats.length > INITIAL_CLUSTER_COUNT && (
                <button className="show-more-btn show-more-btn-editorial" onClick={() => setShowAllClusters(!showAllClusters)}>
                  {showAllClusters ? '收起' : `显示更多 (${stats.length - INITIAL_CLUSTER_COUNT} 个)`}
                </button>
              )}
            </div>
          </div>

          <div className="goal-support-grid">
            {unlinkedSuggestions.length > 0 && (
              <div>
                <SectionTitle title="未关联事件建议" subtitle="保持辅助地位，不抢走聚类正文的注意力。" compact />
                <UnlinkedEventSection
                  suggestions={unlinkedSuggestions}
                  clusters={clusters}
                  onRefresh={fetchData}
                />
              </div>
            )}

            <div>
              <SectionTitle title="活动节奏" subtitle="用更轻的节奏图补充目标投入的近期波动。" compact />
              <GoalRhythmPlaceholder distribution={distribution} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
```

- [ ] **Step 3: Add the compact metric strip, section header, and cadence placeholder helpers**

Add these helpers near the subcomponents in the same file:

```tsx
const CompactGoalMetrics: React.FC<{ stats: OverviewStats }> = ({ stats }) => {
  const items = [
    { label: '总投入', value: `${Math.round((stats.totalDuration / 60) * 10) / 10}h`, description: '目标相关时间总量。' },
    { label: '日均投入', value: `${Math.round((stats.dailyAvgDuration / 60) * 10) / 10}h`, description: '过去 30 天平均值。' },
    { label: '目标覆盖率', value: `${Math.round(stats.goalCoverageRate * 100)}%`, description: '已绑定目标的时间占比。' },
    { label: '活跃聚类', value: `${stats.activeClusters}`, description: '有记录的目标群数量。' },
  ];

  return (
    <div className="goal-metric-strip">
      {items.map(item => (
        <div key={item.label} className="goal-metric-card">
          <div className="goal-metric-label">{item.label}</div>
          <div className="goal-metric-value">{item.value}</div>
          <div className="goal-metric-description">{item.description}</div>
        </div>
      ))}
    </div>
  );
};

const SectionTitle: React.FC<{
  title: string;
  subtitle?: string;
  compact?: boolean;
}> = ({ title, subtitle, compact = false }) => (
  <div className={`goal-section-title ${compact ? 'compact' : ''}`}>
    <div className="goal-section-title-row">
      <h2>{title}</h2>
      <span />
    </div>
    {subtitle && <p>{subtitle}</p>}
  </div>
);

const GoalRhythmPlaceholder: React.FC<{ distribution: GoalDistributionItem[] }> = ({ distribution }) => {
  const topItems = distribution.slice(0, 3);

  return (
    <div className="goal-rhythm-card">
      <div className="goal-rhythm-lines">
        {topItems.map((item, index) => (
          <div
            key={item.clusterId}
            className="goal-rhythm-line"
            style={{
              background: `linear-gradient(90deg, ${ANALYSIS_CLUSTER_PALETTE[index]}, ${getAnalysisSurfaceTint(undefined, ANALYSIS_CLUSTER_PALETTE[index], 0.35)})`,
            }}
          />
        ))}
      </div>
      <div className="goal-rhythm-legend">
        {topItems.map((item, index) => (
          <div key={item.clusterId} className="goal-rhythm-legend-item">
            <span style={{ backgroundColor: ANALYSIS_CLUSTER_PALETTE[index] }} />
            <span>{item.clusterName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run a targeted lint check for the Goal TypeScript changes**

Run:

```bash
npx eslint src/components/GoalAnalysisPage/GoalAnalysisPage.tsx src/services/analysis/displayColors.ts
```

Expected: command exits with code `0`.

## Task 7: Replace GoalAnalysisPage CSS With the Editorial Chapter Styling

**Files:**
- Modify: `src/components/GoalAnalysisPage/GoalAnalysisPage.css`
- Verify: `src/components/GoalAnalysisPage/GoalAnalysisPage.tsx`, `src/components/GoalAnalysisPage/GoalAnalysisPage.css`

- [ ] **Step 1: Replace the top-level goal page layout styles**

Replace the outer page styling in `src/components/GoalAnalysisPage/GoalAnalysisPage.css` with:

```css
.goal-editorial-page {
  padding: 24px 28px 40px;
  background: linear-gradient(180deg, #efe7dc 0%, #f4ede4 100%);
}

.goal-editorial-shell {
  max-width: 1500px;
  margin: 0 auto;
}

.goal-analysis-header-editorial {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

.goal-heading-group {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.goal-kicker {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #95897c;
  font-weight: 700;
}

.goal-analysis-header-editorial h1 {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 2.7rem;
  line-height: 0.96;
  font-weight: 400;
}

.goal-chapter-card {
  padding: 24px;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 28px;
  box-shadow: 0 30px 80px -52px rgba(63, 43, 21, 0.34);
}

.goal-metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 22px;
}

.goal-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 1.05fr);
  gap: 24px;
}

.goal-support-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  margin-top: 24px;
}
```

- [ ] **Step 2: Add the metric, section title, cluster, and support-panel rules**

Append these support rules:

```css
.goal-metric-card {
  padding-top: 12px;
  border-top: 2px solid #1d1712;
  min-height: 92px;
}

.goal-metric-label {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #95897c;
  font-weight: 700;
}

.goal-metric-value {
  margin-top: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.5rem;
  font-weight: 600;
  color: #1d1712;
}

.goal-section-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.goal-section-title-row h2 {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 1.6rem;
  font-weight: 400;
}

.goal-section-title-row span {
  flex: 1;
  height: 1px;
  background: rgba(67, 51, 35, 0.1);
}

.goal-section-title p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #95897c;
}

.cluster-card {
  background: rgba(255, 255, 255, 0.26);
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 16px;
}

.cluster-details {
  background: rgba(255, 255, 255, 0.18);
}

.show-more-btn-editorial {
  margin-top: 14px;
  background: rgba(255, 255, 255, 0.28);
}

.goal-rhythm-card {
  padding: 16px;
  border: 1px solid rgba(67, 51, 35, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.22);
}

.goal-rhythm-lines {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.goal-rhythm-line {
  height: 18px;
  border-radius: 999px;
}

.goal-rhythm-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.goal-rhythm-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #60564c;
}

.goal-rhythm-legend-item span:first-child {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

@media (max-width: 1240px) {
  .goal-metric-strip,
  .goal-main-grid,
  .goal-support-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Run a targeted lint/diagnostic pass on the Goal files**

Run:

```bash
npx eslint src/components/GoalAnalysisPage/GoalAnalysisPage.tsx src/services/analysis/displayColors.ts
```

Expected: command exits with code `0`.

## Task 8: Run End-to-End Verification For the Analysis Flow

**Files:**
- Verify: `src/components/Dashboard/Dashboard.tsx`
- Verify: `src/components/Dashboard/Dashboard.css`
- Verify: `src/components/TrendPage/TrendPage.tsx`
- Verify: `src/components/TrendPage/TrendPage.css`
- Verify: `src/components/GoalAnalysisPage/GoalAnalysisPage.tsx`
- Verify: `src/components/GoalAnalysisPage/GoalAnalysisPage.css`
- Verify: `src/services/analysis/displayColors.ts`

- [ ] **Step 1: Run targeted ESLint on all touched TypeScript files**

Run:

```bash
npx eslint \
  src/services/analysis/displayColors.ts \
  src/components/Dashboard/Dashboard.tsx \
  src/components/TrendPage/TrendPage.tsx \
  src/components/GoalAnalysisPage/GoalAnalysisPage.tsx
```

Expected: command exits with code `0` and does not introduce new lint errors in touched files.

- [ ] **Step 2: Start the app for manual desktop verification**

Run:

```bash
npm run dev
```

Expected: Vite starts successfully and serves the app locally.

- [ ] **Step 3: Manually verify Dashboard at desktop width**

Check these points in the browser:

```text
1. Dashboard is visibly wide and not mobile-narrow.
2. The lead metric is the strongest element on the page.
3. Summary bars, donut segments, and entry cards show clearer muted color separation.
4. Trend and Goal chapter entry cards are visually distinct and clickable.
5. Date-range controls still work.
```

- [ ] **Step 4: Manually verify TrendPage at desktop width**

Check these points in the browser:

```text
1. The page opens as a calmer chapter page, not a second dashboard cover.
2. The stacked area overview uses softened colors that are clearly distinguishable.
3. Weekly comparison and weekly summary read comfortably side by side.
4. Single-category cards keep a wide grid layout.
5. Back navigation returns to Dashboard without losing date range.
```

- [ ] **Step 5: Manually verify GoalAnalysisPage at desktop width**

Check these points in the browser:

```text
1. The page opens as a chapter page with a compact top metric strip.
2. Goal distribution and cluster list fit comfortably in a wide two-column layout.
3. Cluster accents and heat strips feel distinct but not harsh.
4. Unlinked event suggestions and cadence block remain secondary.
5. Back navigation returns to Dashboard without losing date range.
```

- [ ] **Step 6: Run a production build sanity check if lint and manual review are clean**

Run:

```bash
npm run build
```

Expected: build completes successfully. If unrelated repo issues appear, document them and confirm touched analysis files are not the source.

## Self-Review Checklist

Spec coverage check:

1. Full analysis system scope: covered by Tasks 2 through 7.
2. Wide desktop layout requirement: covered in Tasks 3, 5, and 7.
3. Dashboard as editorial cover: covered by Tasks 2 and 3.
4. Trend and Goal as calmer chapters: covered by Tasks 4 through 7.
5. Analysis-only softened palette: covered by Task 1 and consumed in Tasks 2, 4, and 6.
6. Manual verification expectations: covered by Task 8.

Placeholder scan result:

1. No `TODO`, `TBD`, or deferred implementation markers remain.
2. All new files and modified files are named explicitly.
3. All verification commands are concrete.

Type consistency check:

1. Shared color helper names are consistent across all tasks.
2. The same softened color utility is referenced by Dashboard, TrendPage, and GoalAnalysisPage.
3. The Dashboard/Trend/Goal section-header helpers intentionally stay local unless later extraction is necessary during implementation.