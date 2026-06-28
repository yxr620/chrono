<p align="center">
  <img src="assets/icon.png" width="96" alt="Chrono logo">
</p>

<h1 align="center">Chrono</h1>

<p align="center">
  Local-first personal time tracking for daily logs, goals, review, sync, and AI-assisted workflows.
</p>

<p align="center">
  <a href="https://github.com/yxr620/chrono/actions/workflows/ci.yml"><img src="https://github.com/yxr620/chrono/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-Web%20%7C%20Android%20%7C%20macOS-lightgrey" alt="Supported platforms">
  <img src="https://img.shields.io/badge/stack-React%20%2B%20Ionic%20%2B%20TypeScript-3178c6" alt="Tech stack">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>
  &middot;
  <a href="#development">Development</a>
  &middot;
  <a href="#documentation">Documentation</a>
  &middot;
  <a href="#data-and-privacy">Data and Privacy</a>
</p>

Chrono 是一个个人时间追踪应用，用来连续记录一天中做过的事、查看时间分布、追踪每日目标投入，并在需要时通过同步和 AI 助手辅助回顾。

默认数据保存在本地 IndexedDB。同步、托管服务和 AI 能力都是可选配置；不配置云端或模型密钥时，核心记录功能仍可本地使用。

<p align="center">
  <img src="docs/assets/screenshots/chrono-timer.png" width="260" alt="Chrono timer screen">
  <img src="docs/assets/screenshots/chrono-goals.png" width="260" alt="Chrono goals screen">
</p>

## Status

Chrono is in active development.

| Platform | Status |
| --- | --- |
| Web | Supported |
| Android | Supported via Capacitor |
| macOS | Supported via Electron |
| iOS | Experimental |
| Managed services | Optional backend in `server/` |

## Features

- Daily time logging with live timers and manual entries.
- 24-hour timeline for gaps, overlaps, and day review.
- Goal and category tracking for daily time investment.
- JSON import/export for backup and migration.
- Optional OSS-based multi-device sync.
- Optional AI assistant and Quick Capture workflows.
- Desktop-only analytics and maintenance views.

## Quick Start

```bash
git clone https://github.com/yxr620/chrono.git
cd chrono
npm install
npm run dev
```

The Vite dev server normally starts at:

```text
http://localhost:5173
```

Copy `.env.example` only when you want optional sync, managed services, or AI configuration:

```bash
cp .env.example .env.local
```

## Development

Common commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Web dev server |
| `npm run dev:test` | Start the isolated browser-test server on port 5180 |
| `npm run build` | Type-check and create a production Web build |
| `npm run build:local` | Build with `.env.local` for local device testing |
| `npm run lint` | Run ESLint |
| `npm run test:app-checks` | Run lightweight app-level regression tests |
| `npm run test:font-system` | Run font-token regression checks |
| `npm run preview` | Preview the production build |

Platform workflows, release steps, Android setup, Electron packaging, environment precedence, and FAQ live in [docs/development.md](docs/development.md).

## Configuration

Chrono runs without cloud configuration. Optional capabilities are enabled through `.env.local` or in-app settings.

| Capability | Typical configuration | Details |
| --- | --- | --- |
| Managed sync / AI | `VITE_AUTH_API_URL` | [server/README.md](server/README.md) |
| BYO OSS sync | `VITE_OSS_REGION`, `VITE_OSS_BUCKET`, OSS credentials | [docs/sync.md](docs/sync.md) |
| BYO AI assistant | `VITE_AI_PROVIDER_ID`, `VITE_AI_MODEL`, `VITE_AI_BASE_URL`, `VITE_AI_API_KEY` | [docs/ai-assistant.md](docs/ai-assistant.md) |

## Downloads

| Platform | How to get it |
| --- | --- |
| Android | Download APKs from [GitHub Releases](https://github.com/yxr620/chrono/releases), or build locally with Capacitor. |
| macOS | Download DMGs from [GitHub Releases](https://github.com/yxr620/chrono/releases), or build locally with Electron. |
| Web | Run with Vite or deploy the generated `dist/` directory. |

Unsigned macOS builds may be blocked by Gatekeeper. After moving `Chrono.app` to `/Applications`, clear quarantine once:

```bash
xattr -cr /Applications/Chrono.app
```

## Documentation

| Document | Description |
| --- | --- |
| [Development Guide](docs/development.md) | Local setup, environment files, Android / Electron builds, release workflow, FAQ |
| [Architecture](docs/architecture.md) | Product model, platform layout, data model, stores, services, and core time-entry behavior |
| [Sync](docs/sync.md) | Multi-device sync design, OSS configuration, conflict handling |
| [AI Assistant](docs/ai-assistant.md) | AI assistant flow, streaming tool calls, provider configuration |
| [Action Registry](docs/action-registry.md) | Local AI tool registry, confirmation flow, read/write/maintenance action contracts |
| [Metadata Predictor](docs/metadata-predictor.md) | Local category / goal prediction for the main form and Quick Capture |
| [Browser Testing](docs/browser-testing.md) | Isolated browser validation workflow and test data setup |
| [Managed Backend](server/README.md) | Function Compute backend setup for managed services |

## Data and Privacy

Chrono is local-first. Time entries, goals, categories, and settings stay on the device unless you explicitly enable sync, managed services, or AI features.

When AI is enabled, prompts, tool schemas, selected conversation context, and tool results may be sent to the configured AI provider or managed backend. Leave AI disabled for a fully local workflow.

## Contributing

This is primarily a personal project. Focused issues and pull requests are welcome for reproducible bugs, platform build fixes, documentation updates, and small feature improvements.

Large changes should start with an issue that describes the problem, expected behavior, affected platform, and migration or testing considerations.

## License

No open-source license has been declared. Until a license is added, all rights are reserved by the repository owner.
