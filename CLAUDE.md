# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # TypeScript compile + Vite production build
npm run lint         # ESLint checks
npm run preview      # Preview production build
npm run ai:debug     # CLI debugging for AI assistant

# Mobile (Android)
npm run build && npx cap copy           # Sync web build to Android
npx cap open android                    # Open in Android Studio

# Desktop (Electron via Capacitor)
npm run build && npx cap sync @capacitor-community/electron
cd electron && npm run electron:start   # Start Electron (inspector on port 5858)
cd electron && npm run electron:make    # Build distributable (.dmg/.app)
```

There are no automated tests — linting is the primary code quality check.

## Architecture

**Chrono** is a multiplatform time tracker (web, Android, macOS) built with React + Ionic + Capacitor. The same web codebase targets all platforms.

### Tech Stack
- **UI**: React 18 + Ionic React 8 + TypeScript
- **Build**: Vite 7 (web/Android), Electron 26 (macOS via `@capacitor-community/electron`)
- **State**: Zustand 5 (6 stores)
- **Persistence**: Dexie.js (IndexedDB) — database name `TimeTrackerDB`
- **Dates**: Day.js

### State Management (`src/stores/`)
Six Zustand stores, each with a clear domain:
- `entryStore` — time entries (CRUD, active timer control)
- `goalStore` — goal management
- `categoryStore` — activity categories (6 hardcoded types)
- `dateStore` — globally selected date shared across pages
- `syncStore` — sync status and OSS configuration
- `aiStore` — AI assistant settings and conversation history

### Data Layer (`src/services/`)
- `db.ts` — Dexie schema: tables `entries`, `goals`, `categories`, `syncMetadata`, `syncOperations`
- `dataService.ts` — CRUD operations wrapper used by stores (sits between stores and `db.ts`)
- `syncDb.ts` — DB wrapper that tracks changes for sync
- `syncEngine.ts` — Push/pull/merge sync (oplog + snapshot, LWW strategy)
- `oss.ts` — Aliyun OSS operations (optional cloud backend)
- `export.ts` — JSON import/export
- `ai/` — AI assistant with function-calling, supports multiple LLM providers (Qwen, Gemini, GLM, Kimi, MiniMax, OpenAI, custom)
- `analysis/` — Data analysis (goal clustering, trend analysis)

All records have `version`, `deviceId`, `syncStatus`, and `deleted` (soft delete) fields for sync support.

### Components & Pages (`src/components/`)
There is no separate pages directory — all page-level components live under `src/components/` alongside smaller shared components.

### Routing & Layout (`src/App.tsx`)
Responsive: switches between mobile layout (bottom tabs) and desktop layout (sidebar split-pane) at the **1024px** breakpoint. Mobile tabs: Records, Goals, Export. Desktop-only pages: Dashboard, Trends, GoalAnalysis, AIAssistant, Maintenance.

### Categories
Six preset categories + user-defined custom categories. Colors are stored in the DB (`Category.color` field, added in schema v5). Preset defaults live in `src/config/categoryColors.ts`. Users manage categories via Maintenance → 类别管理 tab.

### Multi-Device Sync
Optional — disabled if OSS is not configured. Uses Aliyun OSS as the backend. Architecture: oplog (operation log) + snapshot (full state), LWW merge strategy. Configure via `.env` using `VITE_OSS_*` variables (see `.env.example`).

### AI Assistant
Desktop-only feature. Configured via `VITE_AI_*` env variables. Uses tool/function calling to query time entry data. Multiple providers supported.

### Platform Data Paths
- **Web**: IndexedDB in browser
- **Android**: app data directory via Capacitor
- **macOS (Electron)**: `~/Library/Application Support/Chrono/`

### Environment Variables
Copy `.env.example` to `.env.local`. OSS and AI config are optional — the app functions without them.
