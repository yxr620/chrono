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

# Mobile (Android)
npm run build:local && npx cap copy     # Local testing (with secrets)
npm run build && npx cap copy           # Release build (no secrets)
npx cap open android                    # Open in Android Studio

# Desktop (Electron via Capacitor)
npm run build && npx cap sync @capacitor-community/electron
cd electron && npm run electron:start   # Start Electron (inspector on port 5858)
cd electron && npm run electron:make    # Build distributable (.dmg/.app)
```

Linting is the primary code quality check. A small number of `node --test` suites exist (`npm run test:app-checks`, `npm run test:font-system`, defined in `tests/`); there is no full test suite.

## Architecture

**Chrono** is a multiplatform time tracker (web, Android, iOS, macOS) built with React + Ionic + Capacitor. The same web codebase targets all platforms.

### Tech Stack
- **UI**: React 18 + Ionic React 8 + TypeScript
- **Build**: Vite 7 (web/Android/iOS), Electron 26 (macOS via `@capacitor-community/electron`)
- **State**: Zustand 5 (8 stores)
- **Persistence**: Dexie.js (IndexedDB) — database name `TimeTrackerDB`
- **Dates**: Day.js

### State Management (`src/stores/`)
Eight Zustand stores, each with a clear domain:
- `entryStore` — time entries (CRUD, active timer control)
- `goalStore` — goal management
- `categoryStore` — activity categories (6 presets + user-defined custom)
- `dateStore` — globally selected date shared across pages
- `syncStore` — sync status and OSS configuration
- `aiStore` — AI assistant settings and conversation history
- `authStore` — Managed mode sign-in state and JWT
- `featureModeStore` — per-feature mode (`disabled` / `byo` / `managed`)

### Data Layer (`src/services/`)
- `db.ts` — Dexie schema: tables `entries`, `goals`, `categories`, `syncMetadata`, `syncOperations`
- `dataService.ts` — High-level CRUD + maintenance queries used by stores, AI tools, and analysis (reads via `db`, writes via `syncDb`)
- `syncDb.ts` — DB wrapper that tracks changes for sync
- `syncEngine.ts` — Push/pull/merge sync (oplog + snapshot, LWW strategy)
- `oss.ts` — Aliyun OSS operations (optional cloud backend)
- `export.ts` — JSON import/export
- `actions/` — AI-first Action Registry (read/write/maintenance actions, see `docs/action-registry.md`)
- `ai/` — AI assistant powered by **Vercel AI SDK** (`ai@5.x` + `@ai-sdk/openai-compatible`); `streamChatWithTools` drives the assistant loop (text + tool_calls in one continuous stream), `generateChatOnce` drives quickCapture single-shot parse. Supports Qwen, Gemini, GLM, Kimi, MiniMax, OpenAI, custom.
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

Per-feature mode (`disabled` / `byo` / `managed`) is stored in `chrono_feature_modes` in localStorage. Routing happens through `src/services/gateway/` (`CompositeGateway` → `ByoGateway` or `ManagedGateway`). A one-time `MigrationPrompt` (mounted in `App.tsx`) offers existing BYO users a one-click switch on boot — opting in scrubs every provider's BYO `apiKey` from localStorage.

Backend code: `server/src/`. Deploy with `server/deploy.sh` then upload the resulting zip in the Aliyun FC console. Operator runbook: `server/RUNBOOK.md`. Full design (archived): `docs/superpowers/archive/2026-04-21-managed-services.md`.

**Two FC functions exist** for historical reasons: `chrono-api` (legacy, HTTP request-response trigger — buffered) and `chrono-api-web` (Web 函数 / Custom Runtime — supports true SSE streaming, required for accurate AI assistant phase timing). `chrono-api` is kept alive because shipped clients have the old URL compiled into their build; deleting it would break already-installed APKs. New deploys go to `chrono-api-web`; the same zip can be uploaded to both. Both `.env.local` and `.env.production` must point to `chrono-api-web` so dev matches release.

### Multi-Device Sync
Optional. Two modes: BYO (user-supplied OSS keys) or Managed (signed STS tokens via the Chrono backend). Architecture: oplog (operation log) + snapshot (full state), LWW merge strategy. Both modes write to the same `sync/{userId}/` prefix and converge across modes. See Managed Services section.

### AI Assistant
Desktop-only feature. Two modes: BYO (`VITE_AI_*` env vars + per-provider settings UI) or Managed (`/v1/chat/completions` proxy on the Chrono backend, requires sign-in and email allowlist). Uses tool/function calling to query time entry data. BYO supports Qwen, Gemini, GLM, Kimi, MiniMax, OpenAI, and a custom OpenAI-compatible endpoint.

Streaming model: every call uses `streamText` (SDK v5). `toolCallEngine.ts` is an event translator over `result.fullStream`, mapping SDK events to six UI phase rows: `preparing` / `requesting` / `reasoning` / `composingTool` / `toolCall` / `answering`. Each row carries structured debugInfo (MODEL REQUEST, REASONING per-step text streamed live, TOOL INPUT, TOOL CALL input+output); the active `reasoning` row force-expands so reasoning text streams visibly. The SDK handles cross-chunk `tool_call` argument accumulation, multi-step tool loops (`stopWhen: stepCountIs(5)`), and reasoning/`<think>` normalisation. See `docs/ai-assistant.md`.

Managed mode's true streaming depends on the Aliyun FC trigger type — HTTP streaming response gives true SSE pass-through; HTTP request-response falls back to buffered relay. See `server/RUNBOOK.md` *Streaming relay (since 2026-05-16)*.

### Platform Data Paths
- **Web**: IndexedDB in browser
- **Android / iOS**: app data directory via Capacitor
- **macOS (Electron)**: `~/Library/Application Support/Chrono/`

### Environment Variables
Copy `.env.example` to `.env.local`. All variables are optional — the app functions without them. `VITE_AUTH_API_URL` enables managed mode; `VITE_OSS_*` and `VITE_AI_*` populate BYO defaults.
