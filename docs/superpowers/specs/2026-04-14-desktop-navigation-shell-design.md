# Chrono Desktop Navigation and Page-Adaptive Shell Design

## Summary

This design updates the Chrono desktop navigation model without forcing all desktop pages into one visual style.

The approved direction is a three-state desktop navigation system:

1. A narrow icon rail is always visible on desktop.
2. Clicking the rail opens a contextual drawer.
3. Users can temporarily pin the drawer into a full sidebar on wide screens.

The desktop shell should become structurally consistent, not visually uniform. Each page should remain internally coherent in its own visual language. Analysis keeps its warm editorial tone. Other pages may stay lighter, denser, or more tool-like.

The shell adapts to the active page only at a low-intensity level: material, surface tint, border intensity, and highlight color may change, but navigation structure and interaction behavior stay consistent across pages.

## Goals

1. Reduce the desktop sidebar footprint so content-heavy pages gain more usable width.
2. Replace the current always-wide sidebar with a desktop-native rail plus expandable drawer pattern.
3. Preserve strong page-specific visual identities instead of forcing one global desktop style.
4. Ensure each active page feels internally consistent, including its surrounding navigation shell.
5. Keep desktop navigation discoverable and easy to learn.

## Non-Goals

1. No changes to mobile layout or mobile navigation.
2. No redesign of page content logic, data flow, or store architecture.
3. No requirement that Analysis, Records, Goals, Maintenance, and Settings share the same visual personality.
4. No hover-driven navigation model.
5. No attempt to turn the navigation drawer into a second feature panel full of unrelated actions.

## User-Approved Design Decisions

### Navigation Model

The approved desktop navigation model is icon rail plus click-to-open drawer with optional pinning.

Rules:

1. Desktop defaults to a narrow rail.
2. Clicking opens the drawer.
3. The drawer can be pinned into a full sidebar.
4. Pinning is temporary UI state, but the preference should be remembered locally when screen width allows it.

### Visual Strategy

The desktop app should not be globally unified into one style.

Instead:

1. Structure and interaction stay consistent across desktop pages.
2. Each page keeps its own visual personality.
3. The shell may lightly adapt to the active page, but only through color/material treatment.
4. Typography system, icon system, and interaction model stay stable across pages.

### Shell Adaptation Level

The approved adaptation level is partial:

1. Change background tint or material feel per page.
2. Change border/shadow intensity per page.
3. Change active/highlight color per page.
4. Do not change navigation information architecture.
5. Do not change icon language or component structure.
6. Do not change core motion and interaction rules.

## Problem Statement

The current desktop experience has two distinct issues:

1. The sidebar is too heavy for pages that need working width, especially Records.
2. The Analysis redesign established a warm editorial language, while the surrounding desktop shell still reads like an older, more generic application frame.

However, full-shell visual unification would create a new problem: page types in Chrono have very different jobs.

1. Analysis is for reading and synthesis.
2. Records is a high-frequency operational workspace.
3. Goals is a management surface.
4. Maintenance and Settings are utility pages.

These should not be forced into the same visual personality. The correct consistency target is per-page coherence plus shared shell behavior.

## Experience Principles

### Weak Shell, Strong Page Identity

The shell should provide orientation and navigation, not impose a global mood.

Implications:

1. The rail and drawer establish navigation consistency.
2. The content page establishes tone, density, and hierarchy.
3. The shell should avoid overpowering headers or decorative treatments that compete with the page.

### Discoverability Over Minimalism

The navigation must stay visible enough to teach itself.

Implications:

1. Keep the rail visible at all times on desktop.
2. Do not collapse navigation into a single ambiguous dot.
3. Use the rail to preserve structure even when the drawer is closed.

### Lightweight by Default, Stable for Power Users

The default state should maximize content width, while still giving heavy desktop users a stable navigation mode.

Implications:

1. Default to rail only.
2. Allow temporary drawer expansion.
3. Allow pinned sidebar only where width supports it.

## Navigation Specification

### States

The desktop shell has three navigation states:

1. `rail`: only the narrow icon rail is visible.
2. `drawer`: the rail is visible and a contextual drawer is open as an overlay.
3. `pinned`: the drawer becomes a persistent full sidebar beside the rail.

### Default Behavior

1. Enter any desktop page in `rail` state by default.
2. Clicking the rail trigger or current-page entry opens the drawer.
3. In non-pinned mode, switching pages closes the drawer.
4. In pinned mode, switching pages keeps the sidebar open.

### Rail Interaction Rules

To keep the rail efficient as well as discoverable:

1. Clicking an inactive primary icon navigates directly to that page.
2. Clicking the active page icon toggles the drawer.
3. A dedicated expand affordance near the top of the rail may also open the drawer.
4. Rail icons may use simple tooltips, but not hover-driven expansion.

### Dismissal Behavior

Non-pinned drawer can close through:

1. Clicking the trigger again.
2. Pressing `Esc`.
3. Clicking outside the drawer.
4. Navigating to another page.

### Pinning Behavior

1. Pinning is a user-controlled action from inside the drawer.
2. Pinned state should be locally persisted.
3. If the viewport becomes too narrow for pinned mode, the UI should automatically fall back to `rail` or `drawer`.

### No Hover Expansion

Hover-based expansion is explicitly out of scope.

Reasoning:

1. It is visually noisy.
2. It creates accidental activations.
3. It works poorly for a product with repeated side-edge cursor travel.

## Responsive Rules

### Desktop Breakpoints

The existing desktop threshold at `1024px` remains the desktop entry point.

Desktop shell rules:

1. `1024px - 1279px`: allow `rail` and temporary `drawer`, but do not preserve a permanently pinned full sidebar.
2. `1280px+`: allow all three states, including persistent pinning.

### Width Intent

1. Rail width should be approximately `56px - 64px`.
2. Drawer width should be wide enough for icon, label, and short contextual copy, but still read as a support layer rather than a full application frame.
3. Overlay drawer is preferred over pushing content in temporary mode.
4. Content should shift only in pinned mode.

## Visual System Specification

### Rail

The rail is the permanent structural anchor.

It should contain:

1. Primary navigation icons.
2. A clear current-page active state.
3. A top-level affordance to open the drawer when needed.
4. Secondary global utilities near the bottom when appropriate.

The rail should remain visually restrained. It may tint to match the active page but should not become the dominant visual layer.

### Drawer

The drawer acts as a navigation explainer, not a second page.

It may contain:

1. Full navigation labels.
2. Current page title.
3. Short current-page description or orientation copy.
4. Pin or unpin control.
5. Lightweight global status such as sync state if needed.

It should not become a dumping ground for unrelated settings and actions.

### Page Adaptation

The shell may adapt to the active page through a page theme map.

Theme mapping should favor page families where appropriate rather than forcing every route to invent its own shell skin.

Examples:

1. `dashboard`, `trend`, and `goalAnalysis` should share one analysis-family shell treatment.
2. `records` can use a cleaner and more neutral operational shell treatment.
3. `goals`, `ai`, `maintenance`, and `export` may either map individually or share a neutral utility-family treatment, depending on how visually distinct they need to be.

Approved adaptation scope:

1. Surface tint.
2. Surface opacity.
3. Border color and contrast.
4. Shadow softness.
5. Active accent/highlight color.

Disallowed adaptation scope:

1. Different navigation layouts per page.
2. Different icon metaphors per page.
3. Different motion systems per page.
4. Different typography systems in the shell per page.

### Page Autonomy

Pages remain responsible for their own main content presentation.

Examples:

1. Dashboard keeps its warm editorial cover-page treatment.
2. Records can stay denser, cleaner, and more operational.
3. Goals can remain structured and managerial.
4. Maintenance and Settings can stay more plainly utilitarian.

The shell should not force these pages toward one shared mood.

## Header Strategy

The current desktop header should be weakened or removed in most desktop states.

Reasoning:

1. A persistent heavy top header competes with page-owned title systems.
2. Strong page identity works better when the page owns its opening rhythm.
3. Global signals such as sync state fit better in the rail or drawer than in a separate app-like banner.

Resulting rule:

1. Let each page define its own heading structure.
2. Move global utilities into navigation layers where practical.
3. Avoid stacking a strong global header above a page with its own strong hero/header.

## Component Boundary Proposal

The desktop shell should be split into focused pieces:

1. `DesktopLayout`: owns state orchestration and layout composition.
2. `DesktopNavRail`: owns the persistent narrow rail.
3. `DesktopNavDrawer`: owns temporary and pinned drawer rendering.
4. `desktopThemeMap` or equivalent: maps active page to shell tint tokens.
5. Individual page components: own page-specific visual language and content hierarchy.

This split keeps navigation state management separate from page styling.

## Data and State Impact

This redesign is primarily presentational and interaction-oriented.

Expected state additions:

1. Desktop navigation open/closed state.
2. Desktop navigation pinned/unpinned state.
3. Derived page-theme token selection from `activeTab`.

No changes should be required to:

1. Stores.
2. Data services.
3. Analysis processors.
4. Entry, goal, or sync data models.

## Validation Criteria

The design should be considered successful only if the following are true:

1. Analysis page still feels like a coherent warm editorial experience.
2. Records gains meaningful horizontal room compared with the current 220px sidebar layout.
3. The rail remains self-explanatory enough that navigation is still discoverable.
4. Shell adaptation makes each active page feel internally coherent without making the app feel like a different product on each route.
5. Pinned state helps frequent desktop users without becoming a new default burden on narrower screens.
6. The removal or weakening of the desktop header does not reduce access to critical global status.

## Rollout Scope

This design covers desktop shell behavior and shell-page relationship rules.

It does not require all desktop pages to be redesigned at once.

Recommended rollout order:

1. Replace the current desktop sidebar with rail plus drawer plus pinning behavior.
2. Introduce page-theme-aware shell tinting.
3. Remove or weaken the current desktop header where it conflicts with page-owned headers.
4. Adjust individual pages only where the new shell reveals spacing or hierarchy issues.

## Open Implementation Notes

Implementation should prefer minimal structural change to existing routing and tab-selection behavior.

The redesign should preserve:

1. Existing `activeTab` behavior in `App.tsx`.
2. Current desktop-only analysis routing model.
3. Current page components as the primary owners of content layout.

The work should focus on shell composition, desktop state, and visual boundaries rather than broad page rewrites.