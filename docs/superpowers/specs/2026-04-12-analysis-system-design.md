# Chrono Analysis System Redesign

## Summary

This redesign covers the full desktop-only analysis experience, not just a single subpage.

The analysis system will be restructured into a three-page editorial experience:

1. Dashboard acts as a wide-format cover page.
2. TrendPage acts as Chapter 01 for category trend reading.
3. GoalAnalysisPage acts as Chapter 02 for goal structure reading.

The visual language is warm editorial rather than generic dashboard UI: paper-toned surfaces, serif display typography, restrained chrome, and clear information hierarchy. The landing page carries the strongest visual drama. The subpages stay calmer and prioritize data readability.

## Goals

1. Redesign the entire analysis experience reached from the desktop sidebar entry labeled 分析.
2. Preserve a wide desktop layout instead of compressing pages into mobile-like narrow columns.
3. Create a coherent visual system across Dashboard, TrendPage, and GoalAnalysisPage.
4. Increase visual differentiation between categories and analytical sections without making the page overly saturated.
5. Keep existing data logic and analysis capability intact while improving hierarchy, navigation, and readability.

## Non-Goals

1. No changes to mobile layouts or mobile analysis availability.
2. No changes to data models, store structure, clustering logic, or processor algorithms.
3. No change to how categories are stored in the database.
4. No attempt to redesign unrelated application sections outside the analysis flow.

## User-Approved Design Decisions

### Overall System Direction

The approved direction is Cover + Chapters:

1. Dashboard keeps the strongest editorial cover-page treatment.
2. TrendPage and GoalAnalysisPage share the same warm editorial system but use calmer chapter-page layouts.
3. The analysis experience should feel intentionally desktop-native, with enough horizontal space to breathe.

### Color Strategy

The analysis experience will use an analysis-only display palette derived from the existing category colors.

The original preset category colors are too saturated for the warm editorial surfaces, so analysis pages should apply a display offset palette at render time:

1. Retain category identity by hue family.
2. Reduce saturation.
3. Slightly lift brightness where needed.
4. Mix each hue toward the paper-toned surface so adjacent series are easier to read together.

This means the database and category management continue using the current stored colors, while the analysis views render softened presentation colors.

Approved analysis palette targets:

| Category | Raw | Analysis Display |
| --- | --- | --- |
| 学习 | `#1890FF` | `#5C7FA3` |
| 工作 | `#40A9FF` | `#7EA3B3` |
| 日常 | `#FFA940` | `#C68D4E` |
| 运动 | `#FF7A45` | `#C77459` |
| 休息 | `#9254DE` | `#7C6AA4` |
| 娱乐 | `#B37FEB` | `#9C82B1` |
| 未分类/中性项 | n/a | `#B5A896` |

## Architecture and Information Flow

### Entry Flow

The desktop sidebar continues to expose a single 分析 entry that opens Dashboard.

Flow:

1. Dashboard introduces the period at a glance.
2. Dashboard provides compact analysis summaries and entry cards into deeper chapters.
3. TrendPage focuses on category movement across time.
4. GoalAnalysisPage focuses on grouped goal structure and supporting recommendations.

### Shared State and Data

Existing shared date-range behavior remains unchanged:

1. `App.tsx` keeps analysis date range state and passes it to Dashboard, TrendPage, and GoalAnalysisPage.
2. Dashboard continues using `processor.ts` outputs.
3. TrendPage continues using grouped daily and weekly analysis data from `processor.ts`.
4. GoalAnalysisPage continues using `goalAnalysisProcessor.ts` and goal clustering outputs.

No processor APIs need to change for the redesign. The work is primarily presentational plus lightweight view-model formatting.

## Layout Specification

### Shared Desktop Layout Rules

1. Keep pages wide. Do not design them as centered narrow mobile-style columns.
2. Use generous desktop widths per page.
3. Preserve enough horizontal room for side-by-side analysis sections.
4. Maintain readable max widths rather than full-bleed edge-to-edge content.

Target widths:

1. Dashboard: approximately 1500px to 1560px max width.
2. TrendPage: approximately 1560px to 1600px max width.
3. GoalAnalysisPage: approximately 1450px to 1520px max width.

### Shared Visual System

All three pages should share:

1. Warm paper-toned backgrounds and card surfaces.
2. Serif display typography for page titles and section titles.
3. Sans-serif body typography for labels and explanatory text.
4. Thin editorial separators rather than heavy card outlines everywhere.
5. Soft shadows and subtle layered surfaces.

## Dashboard Specification

### Role

Dashboard is the cover page of the analysis system. It should feel like the first page of a data journal rather than a conventional KPI grid.

### Structure

Dashboard should contain five zones in order:

1. Page header with title and date range selector.
2. Lead band with a large total-time headline.
3. Three compact structural metrics.
4. Summary analysis content.
5. Chapter entry cards for TrendPage and GoalAnalysisPage.

### Header

The header contains:

1. Large serif page title.
2. Short period metadata line.
3. Existing range selector controls.

The range selector can remain functionally similar, but styling should shift to flatter editorial controls rather than pill-heavy dashboard widgets.

### Lead Band

The lead band is the most dramatic element in the analysis system.

Requirements:

1. Display total tracked time as the dominant headline.
2. Place a short explanatory copy block beside it.
3. Keep the band wide and open, with strong horizontal balance.

### Metrics

Dashboard keeps three supporting metrics:

1. Daily average.
2. Goal coverage.
3. Active cluster count.

These metrics should use a restrained editorial treatment:

1. Top border or rule line.
2. Compact uppercase label.
3. Monospace or crisp numeric value.
4. Short supporting description.

### Summary Content

Dashboard should summarize, not exhaust.

Included summaries:

1. Goal/top objective distribution summary.
2. Category distribution summary.
3. Hour rhythm summary.

These summaries should be visually lighter than their dedicated chapter pages.

### Chapter Entry Cards

Dashboard includes two clear chapter entry cards:

1. 类别趋势分析.
2. 目标深度分析.

These cards should be visually distinct from summary charts and use analysis palette accents to help users navigate.

## TrendPage Specification

### Role

TrendPage is Chapter 01. It is for reading category movement, not for repeating Dashboard’s cover-page drama.

### Structure

TrendPage should contain:

1. Header row with back button, title, and shared date range selector.
2. Large overview chart.
3. Weekly comparison block.
4. Weekly summary block.
5. Grid of single-category trend cards.

### Header

The header should look like a chapter opening:

1. Back affordance should be lighter and more editorial than app-like.
2. Title uses serif display styling.
3. Supporting subtitle can describe the chapter purpose.

### Overview Chart

The stacked area overview remains the first visual focus.

Requirements:

1. Increase color separation via the softened analysis palette.
2. Keep background chrome minimal so colored layers remain legible.
3. Use paper-compatible fills and lines rather than vivid neon-like colors.

### Weekly Comparison and Summary

The current weekly comparison section stays, but its presentation should become more structured:

1. The grouped or stacked comparison chart becomes a primary chapter block.
2. The summary list becomes a clean editorial annotation column.
3. Category bars in the summary must use the display palette.

### Single-Category Cards

The current small trend cards remain useful and should stay.

Improvements:

1. Give them more refined card framing.
2. Use category-specific accents in titles and lines.
3. Keep them arranged in a wide desktop grid with strong horizontal density.

## GoalAnalysisPage Specification

### Role

GoalAnalysisPage is Chapter 02. It explains goal structure, goal-group concentration, and supporting recommendation signals.

### Structure

GoalAnalysisPage should contain:

1. Header row with back button, title, and shared date range selector.
2. Compact top metrics row.
3. Two-column main body.
4. Bottom support row.

### Header

The header mirrors TrendPage so the two chapter pages feel related.

### Top Metrics Row

Keep the four current metrics, but restyle them into a compact editorial strip:

1. Total duration.
2. Daily average duration.
3. Goal coverage.
4. Active clusters.

These should not compete with Dashboard’s headline treatment.

### Main Body

The main reading area is two columns:

1. Left: goal distribution.
2. Right: goal cluster list.

#### Goal Distribution

Requirements:

1. Use horizontal bars with softened categorical or semantic accents.
2. Preserve ranking clarity and relative magnitude.
3. Avoid loud gradients that break the editorial tone.

#### Goal Cluster List

Requirements:

1. Preserve ranking order and cluster metadata.
2. Keep the recent-activity heat strip.
3. Use softened accents to differentiate clusters while keeping the list calm.
4. Expanded detail state should feel like inline reading, not a noisy accordion block.

### Bottom Support Row

The page should include two supporting panels:

1. Unlinked event suggestions.
2. Activity rhythm or cadence visualization.

These stay secondary in prominence and should support the cluster reading rather than distract from it.

## Color Application Rules

The softened palette should be applied consistently across the analysis system.

### Use Cases

1. Trend chart lines and area fills.
2. Weekly summary bars.
3. Distribution bars.
4. Donut/pie segments.
5. Cluster heat strips.
6. Section-level accent text when appropriate.

### Guardrails

1. Do not tint every card background with category colors.
2. Reserve color for marks, highlights, tiny badges, and selective headings.
3. Keep base surfaces neutral and paper-like.
4. Ensure adjacent colors differ enough in value and temperature to remain readable.

## Component and Implementation Boundaries

### Shared Utilities

Introduce a small analysis-only display-color utility that maps category colors to presentation colors. This utility should be reused by Dashboard and TrendPage, and optionally by GoalAnalysisPage where semantic accents are needed.

Likely responsibilities:

1. Return softened display colors for preset categories.
2. Provide a neutral fallback color.
3. Optionally expose helper values for low-alpha fills and border tints.

### Page-Level Refactoring

The redesign may justify extracting small view components if needed, but should avoid unnecessary architecture churn.

Good candidates:

1. Shared analysis header/date-range block styling.
2. Shared section title component styling.
3. Shared analysis display color helper.

Avoid changing processor or store boundaries just to support styling.

## Loading, Empty, and Error States

### Loading

Loading states should match the new visual system:

1. Wide layout preserved.
2. Spinner and copy should sit in a paper-toned context.
3. Avoid reverting to generic centered plain layouts where possible.

### Empty States

Empty states should preserve chapter identity:

1. Dashboard empty state stays welcoming and broad.
2. TrendPage empty state should still look like a chapter page.
3. GoalAnalysisPage empty state should still look like a chapter page.

### Error Handling

The existing error behavior may remain console-based for now, but the layout should not collapse if a data block is missing. The redesign should remain robust when one chart has no usable data.

## Verification Strategy

There are no automated tests in this repo, so verification should focus on linting affected files and manual review.

Minimum verification expectations after implementation:

1. Run lint on touched files or run the project lint command if feasible.
2. Manually verify Dashboard on desktop width.
3. Manually verify TrendPage on desktop width.
4. Manually verify GoalAnalysisPage on desktop width.
5. Confirm colors are distinguishable but not visually harsh.
6. Confirm wide layouts remain wide and do not collapse into narrow mobile-like proportions.
7. Confirm date range controls and page navigation still behave exactly as before.

## Implementation Sequence

Recommended implementation order:

1. Add analysis display color utility and shared design tokens.
2. Redesign Dashboard layout and styling.
3. Redesign TrendPage layout and styling.
4. Redesign GoalAnalysisPage layout and styling.
5. Run verification and visual pass.

## Open Scope Decisions Resolved

The following points are now fixed and should not be reopened during implementation unless new constraints appear:

1. The redesign covers the full desktop analysis system.
2. Dashboard remains the analysis landing page.
3. The approved system direction is Cover + Chapters.
4. Dashboard keeps the strongest editorial drama.
5. TrendPage and GoalAnalysisPage become calmer chapter pages.
6. Wide desktop width is a hard requirement.
7. Analysis pages use a softened display palette rather than raw category colors.