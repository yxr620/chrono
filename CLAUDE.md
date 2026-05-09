# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Release build — no secrets (production mode, uses .env.production)
npm run build:local  # Local build — keeps .env.local secrets (for Android/device testing)
npm run lint         # ESLint checks
npm run preview      # Preview production build
npm run ai:debug     # CLI debugging for AI assistant

# Mobile (Android)
npm run build:local && npx cap copy     # Local testing (with secrets)
npm run build && npx cap copy           # Release build (no secrets)
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

### Managed Services (optional)

If `VITE_AUTH_API_URL` is set, the app offers **Managed mode** for paid features (sync + AI). Users sign in with email/password; the backend (Aliyun Function Compute, source in `server/`) signs OSS STS tokens and proxies LLM calls. Without `VITE_AUTH_API_URL`, only BYO mode is available — users supply their own credentials via the **Services** page.

Per-feature mode (`off` / `byo` / `managed`) is stored in `chrono_feature_modes` in localStorage. Routing happens through `src/services/gateway/` (`CompositeGateway` → `ByoGateway` or `ManagedGateway`). A one-time `MigrationPrompt` (mounted in `App.tsx`) offers existing BYO users a one-click switch on boot — opting in scrubs every provider's BYO `apiKey` from localStorage.

Backend code: `server/src/`. Deploy with `server/deploy.sh` then upload the resulting zip in the Aliyun FC console. Operator runbook: `server/RUNBOOK.md`. Full design (archived): `docs/superpowers/archive/2026-04-21-managed-services.md`.

### Multi-Device Sync
Optional. Two modes: BYO (user-supplied OSS keys) or Managed (signed STS tokens via the Chrono backend). Architecture: oplog (operation log) + snapshot (full state), LWW merge strategy. Both modes write to the same `sync/{userId}/` prefix and converge across modes. See Managed Services section.

### AI Assistant
Desktop-only feature. Two modes: BYO (`VITE_AI_*` env vars + per-provider settings UI) or Managed (`/v1/chat/completions` proxy on the Chrono backend, requires sign-in and email allowlist). Uses tool/function calling to query time entry data. BYO supports Qwen, Gemini, GLM, Kimi, MiniMax, OpenAI, and a custom OpenAI-compatible endpoint.

### Platform Data Paths
- **Web**: IndexedDB in browser
- **Android**: app data directory via Capacitor
- **macOS (Electron)**: `~/Library/Application Support/Chrono/`

### Environment Variables
Copy `.env.example` to `.env.local`. All variables are optional — the app functions without them. `VITE_AUTH_API_URL` enables managed mode; `VITE_OSS_*` and `VITE_AI_*` populate BYO defaults.
