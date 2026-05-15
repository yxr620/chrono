# Chrono

个人时间追踪应用，记录每一天的时间流水，追踪目标投入。支持 Web、Android 和 macOS 三个平台。

<!-- 如果你有截图，取消下面注释并替换路径 -->
<!-- ![Chrono Screenshot](docs/assets/screenshot.png) -->

## 下载

| 平台 | 获取方式 |
|---|---|
| Android | [GitHub Releases](https://github.com/yxr620/time_tracker/releases) 下载 APK |
| Web | `git clone` 后 `npm run dev` 本地运行 |
| macOS | `git clone` 后从 Electron 构建（见 [开发指南](docs/development.md#macos-桌面端开发electron)） |

## 功能概览

**核心功能**
- 统一录入界面 — 实时计时 + 手动添加，打开即用
- 24 小时时间轴 — 可视化一天的时间分布
- 目标管理 — 每日目标 + 时间投入追踪 + 月历热力图
- 活动分类 — 6 个预设类别 + 自定义类别
- 数据导入 / 导出 — JSON 格式，支持全量 / 增量 / 合并 / 替换

**多端同步**（可选）
- 基于阿里云 OSS 的 oplog + snapshot 同步架构，配置后自动同步 — [详情](docs/sync.md)

**桌面端分析**（macOS / Web 宽屏）
- 数据看板 — KPI 卡片、目标分布、类别饼图、时段分布
- 趋势分析 — 面积图、周度对比、类别折线图
- 目标深度分析 — 智能聚类、投入排行、未关联事件建议
- AI 时间助手 — 自然语言查询，基于 Function Calling — [详情](docs/ai-assistant.md)

## 快速开始

```bash
git clone https://github.com/yxr620/time_tracker.git
cd time_tracker
npm install
npm run dev       # → http://localhost:5173
```

如需配置 OSS 同步或 AI 助手，复制 `.env.example` → `.env.local` 并填入对应变量。不配置时这些功能不可用，但应用正常运行。

## 技术栈

| 层次 | 技术 |
|---|---|
| UI | React 18 + Ionic React 8 + TypeScript |
| 状态管理 | Zustand 5（6 个 store） |
| 持久化 | Dexie.js（IndexedDB） |
| 构建 | Vite 7（Web / Android）、Electron 26（macOS） |
| 多平台 | Capacitor 7 |
| 图表 | Recharts |
| 字体 | Fontsource 本地打包：Noto Sans SC Variable + JetBrains Mono Variable |

## 项目结构

```
src/
├── components/     # 页面 + UI 组件（无独立 pages 目录）
├── stores/         # Zustand 状态管理（entry / goal / category / date / sync / ai）
├── services/       # 数据层（db / syncDb / dataService / syncEngine / oss / ai/）
├── config/         # 类别颜色等配置
├── hooks/          # 自定义 Hooks
├── types/          # TypeScript 类型
└── utils/          # 工具函数
android/            # Android 原生项目（Capacitor）
electron/           # macOS 桌面端（Electron）
ios/                # iOS（实验性）
docs/               # 详细文档
```

## 文档

| 文档 | 说明 |
|---|---|
| [开发指南](docs/development.md) | 环境搭建、Android / Electron 构建、APK 发布、FAQ |
| [系统架构](docs/architecture.md) | 架构、布局、数据模型、dataService API |
| [多端同步](docs/sync.md) | OSS 同步架构、配置、冲突解决 |
| [AI 助手](docs/ai-assistant.md) | Function Calling 架构、多服务商配置 |
