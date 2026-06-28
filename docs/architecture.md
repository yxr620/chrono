# 架构概览

## 项目简介

**Chrono** 是一款本地优先的多平台时间追踪应用，使用相同的 Web 代码库同时支持 Web、Android、macOS、IOS 四个平台。

## 使用理念

### 单人使用

本应用为**个人使用**设计。无论是否联网，都是一个人记录自己日常生活的时间流水。

**设计理念：** 记录生活流水账。例如 11:00-12:18 在学习，12:18-12:47 在吃饭，12:47-13:00 在排队……以此完整还原一天的时间使用。建议利用琐碎时间（排队、坐电梯等）进行记录，保持记录的连续性。

### 目标管理理念

本应用的目标管理是**基于每天的时间投入统计**。每天创建目标，统计该目标关联了多少时间记录、总共花了多少时间。不存在"完成/未完成/进行中"这类状态指标——核心关注的是**你在每件事上投入了多少时间**。虽然有打卡的目标，但是这种只是作为提醒的存在，不算重要的目标。

## 技术栈

| 层次 | 技术 |
|---|---|
| UI | React 18 + Ionic React 8 + TypeScript |
| 状态管理 | Zustand 5 |
| 持久化 | Dexie.js 4（IndexedDB，数据库名 `TimeTrackerDB`） |
| 构建工具 | Vite 7（所有平台共用） |
| 桌面壳（macOS） | Electron 26（通过 `@capacitor-community/electron`） |
| 移动壳 | Capacitor 7（Android / iOS） |
| 日期处理 | Day.js |
| 图表 | Recharts 3 |
| 字体 | Fontsource 本地打包：Noto Sans SC Variable + JetBrains Mono Variable |

## 字体系统

Chrono 使用本地打包字体，不依赖 Google Fonts CDN。字体入口在 `src/main.tsx`：

```typescript
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
```

字体 token 由 `src/index.css` 统一定义：

| Token | 用途 |
|---|---|
| `--app-text-family` | 普通 UI 文案、标题、标签、正文，当前指向 `Noto Sans SC Variable` |
| `--app-number-family` | 时间、时长、统计数字、百分比、同步计数，当前指向 `JetBrains Mono Variable` |
| `--app-code-family` | AI/debug/code 文本，默认复用 `--app-number-family` |

`src/index.css` 仍保留 `--app-font-family` / `--app-mono-family` 旧 alias 作为兼容兜底（第三方覆盖、历史分支、遗漏引用），新代码不要再引用它们。`src/font-system.test.ts` 有回归断言保证 `src/components/**` 不会出现旧 token。

数字规则：只需要等宽对齐的数字不能只写 `font-variant-numeric: tabular-nums`。当前计时器、开始/结束时间、时间范围、时长、百分比、统计指标、同步计数、AI/debug/code 文本都应显式使用 `--app-number-family` 或 `--app-code-family`。全局 `.tabular-nums` 已兼容升级为同时应用 number font 和 tabular numeric features。

Ionic 字体入口在 `src/App.css`，通过 `--ion-font-family: var(--app-text-family)` 覆盖平台默认字体，并对常见 Ionic host 和 overlay 组件做继承兜底。

## 平台支持

| 平台 | 入口 | 数据存储路径 |
|---|---|---|
| Web | Vite dev server / 静态部署 | 浏览器 IndexedDB |
| Android | Capacitor Android | App data 目录 |
| iOS | Capacitor iOS | App data 目录 |
| macOS | Electron（`electron/` 目录） | `~/Library/Application Support/Chrono/` |

四个平台共享同一份 `src/` 代码，差异仅在 Capacitor plugin 调用层。

## 响应式布局

`src/App.tsx` 根据屏幕宽度决定使用哪套布局：

```
window.innerWidth >= 1024 → DesktopLayout（侧边栏）
window.innerWidth  < 1024 → MobileLayout（底部 tab 栏）
```

### Mobile 布局（3 个 Tab）

| Tab | 组件 | 说明 |
|---|---|---|
| records | `RecordsPage` | 时间记录主页（表单 + 时间轴 + 列表） |
| goals | `GoalManager` | 目标管理 |
| export | `SettingsPage` | 数据导出 / 同步配置 / AI 设置（tab key 仍为 `export`，组件位于 `components/Settings/`） |

### Desktop 布局（侧边栏，6 个导航项）

| Key | 组件 | 说明 |
|---|---|---|
| records | `RecordsPage` | 同移动端 |
| goals | `GoalManager` | 同移动端 |
| dashboard | `Dashboard` | 数据统计总览（仅桌面端） |
| ai | `AIAssistant` | AI 助手（仅桌面端） |
| maintenance | `MaintenancePage` | 数据维护（仅桌面端） |
| export | `SettingsPage` | 设置与数据管理 |

`TrendPage` 和 `GoalAnalysisPage` 是 Dashboard 内的二级页面，由 Dashboard 内的按钮跳转进入，并有返回 Dashboard 的按钮，不出现在侧边栏导航中。

## 目录结构

> 仅列出目录级结构 + 用途说明。文件级清单以 IDE / `ls` 为准，避免文档与代码漂移。

```
src/
├── App.tsx                # 根组件：路由、布局切换、启动时 Pull
├── main.tsx               # React 入口
├── index.css / App.css    # 全局样式 + 字体 token
├── assets/                # 静态资源（图标等）
│
├── stores/                # Zustand 状态管理（8 个 store，详见"状态管理"节）
│
├── services/              # 数据层与业务逻辑
│   ├── db.ts / syncDb.ts / dataService.ts   # Dexie 数据层（三层封装：Schema → 同步感知 CRUD → 高层查询）
│   ├── syncEngine.ts + sync*.ts             # 同步引擎及配置/调试/事件总线/可用性判断/自动合并
│   ├── oss.ts / authService.ts / userDataService.ts   # 云端 / Managed 后端客户端
│   ├── autoPush.ts / appNavigation.ts       # 数据变更自动 Push、应用内导航辅助
│   ├── goalSuggester.ts / metadataPredictor.ts        # 目标建议、录入元数据预测
│   ├── export.ts          # JSON 导入导出
│   ├── gateway/           # PaidFeatureGateway 抽象（BYO ↔ Managed 路由）
│   ├── actions/           # AI-First Action Registry（详见 action-registry.md）
│   ├── ai/                # AI 助手（详见 ai-assistant.md）
│   ├── analysis/          # 数据分析处理器（趋势、目标聚类、配色）
│   └── quickCapture/      # 自然语言快速录入解析（LLM tool_calls → PendingEntry[]）
│
├── components/            # 页面 + 共享组件，每个子目录对应一个页面或功能块
│                          # （RecordsPage / GoalManager / Dashboard / TrendPage / GoalAnalysisPage /
│                          #  AIAssistant / MaintenancePage / Settings / SyncManagementPage / Migration /
│                          #  Auth / Desktop / TimeTracker / TimelineView / EntryList / QuickCapture /
│                          #  SyncButton / common / ErrorBoundary）
│
├── config/                # 静态配置（类别预设色等）
├── hooks/                 # 共享 React hooks（useAppToast / useDarkMode / useIOSTimePicker / useManagedAiModel）
├── plugins/               # Capacitor 原生插件桥接（iOS 滚轮时间选择器等）
├── types/                 # 共享 TypeScript 类型
└── utils/                 # 纯函数工具
```

## 环境变量

复制 `.env.example` 为 `.env.local`，所有变量均可选：

```env
# Managed Services（推荐）—— 配置后启用「服务」页的 Managed 模式
VITE_AUTH_API_URL=

# BYO（可选）—— 用户自带凭据
VITE_OSS_REGION=oss-cn-hangzhou
VITE_OSS_BUCKET=your-bucket-name
VITE_OSS_ACCESS_KEY_ID=your-access-key-id
VITE_OSS_ACCESS_KEY_SECRET=your-access-key-secret

VITE_AI_PROVIDER_ID=qwen
VITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_AI_API_KEY=your-api-key
VITE_AI_MODEL=qwen3.6-max-preview
```

> **优先级**：应用内配置（localStorage）> .env 环境变量。两项均未配置时，对应功能不可用，但应用正常运行。

## Managed Services（可选托管模式）

如果设置了 `VITE_AUTH_API_URL`，应用会在「服务」页提供 **Managed 模式**：用户用邮箱密码登录，由 Chrono 后端（Aliyun Function Compute）签发 OSS STS token、代理 LLM 调用，不再需要把 AccessKey / API Key 存在 localStorage。BYO 模式始终保留。

- **每功能独立模式**：`sync` 和 `ai` 各自可选 `disabled` / `byo` / `managed`，存在 `localStorage.chrono_feature_modes`
- **路由**：`src/services/gateway/`（`CompositeGateway` → `ByoGateway` 或 `ManagedGateway`），上层调用方对模式无感
- **登录态**：`authStore` 持久化 JWT 与当前用户；7 天过期自动清理
- **首次启动**：`MigrationPrompt`（在 `App.tsx` 挂载）会向已有 BYO 凭据的用户提示一键切换；切换后 BYO 凭据从 localStorage 清空
- **设备/存储/账号管理**：登录后在「维护 → 我的数据」中查看
- **后端代码**：`server/`（FC HTTP trigger，TypeScript Node 18），部署见 `server/RUNBOOK.md`
- **完整设计（已归档）**：`docs/superpowers/archive/2026-04-21-managed-services.md`

### 关键 localStorage 键

| Key | 内容 |
|---|---|
| `chrono_feature_modes` | 每个付费功能的模式（off/byo/managed） |
| `auth_token` / `auth_user` | Managed 登录态 |
| `chrono_migration_seen` | 迁移弹窗已展示标记 |
| `ossConfig` | BYO OSS 凭据 |
| `ai-config` | BYO AI 凭据 |
| `autoSyncEnabled` | 自动同步开关 |

## 开发命令

```bash
npm run dev          # Vite 开发服务器（http://localhost:5173）
npm run build        # TypeScript 编译 + Vite 生产构建（不打包 .env.local 秘钥）
npm run build:local  # 本地构建（保留 .env.local 秘钥，用于 Android/设备调试）
npm run lint         # ESLint 检查（主要代码质量检查）
npm run test:app-checks    # node:test 应用回归脚本（tests/*.test.ts）
npm run test:font-system   # 字体 token 回归测试
npm run preview      # 预览生产构建

# Android && IOS
npm run build && npx cap copy    # 同步 Web 构建到 Android & IOS
npx cap open android             # 在 Android Studio 中打开
npx cap open ios

# macOS Electron
npm run build && npx cap sync @capacitor-community/electron
cd electron && npm run electron:start   # 启动（调试端口 5858）
cd electron && npm run electron:make    # 打包 .dmg/.app
```

---

## 数据模型

应用有三个核心实体：**TimeEntry**、**Goal**、**Category**。所有实体均实现 `Syncable` 接口，支持多端同步。

### Syncable 接口

```typescript
interface Syncable {
  version?: number;                  // 版本号，每次修改 +1
  deviceId?: string;                 // 最后修改设备的 UUID
  syncStatus?: 'synced' | 'pending'; // 同步状态
  deleted?: boolean;                 // 软删除标记（true = 已删除）
}
```

**软删除**：应用中的"删除"操作将 `deleted` 置为 `true`，记录不会从 DB 中物理移除，以确保删除操作能同步到其他设备。

**`updatedAt` 不在 `Syncable` 上**：LWW 冲突解决用的时间戳由每个实体各自声明（见下方 `TimeEntry / Goal / Category`），不是混入字段。

### TimeEntry

```typescript
interface TimeEntry extends Syncable {
  id: string;              // UUID
  startTime: Date;
  endTime: Date | null;    // null 表示当前正在计时
  activity: string;        // 活动描述（用户输入）
  memo?: string;           // 可选感想/备注，与 activity 分离（v7+）
  categoryId: string | null;  // 关联分类 ID
  goalId: string | null;      // 关联目标 ID
  customFields?: Record<string, any>;  // 预留扩展槽，新增字段无需迁移 schema
  createdAt: Date;
  updatedAt: Date;
}
```

`endTime === null` 表示正在进行中的计时，任何时刻最多一条。

### Goal

```typescript
/**
 *  - 'time'  : 时间投入型目标（默认）。与 entries 关联，按计时累计时长。
 *  - 'check' : 打卡/提醒型目标。如"吃药""早点睡"，只追踪是否完成，不参与时长统计。
 *
 * 兼容性：缺省/未知 type 一律按 'time' 处理；旧版本读到新字段会忽略。
 */
type GoalType = 'time' | 'check';

interface Goal extends Syncable {
  id: string;          // UUID
  name: string;
  date: string;        // YYYY-MM-DD
  color?: string;
  type?: GoalType;     // 缺省视为 'time'
  completed?: boolean; // 仅 type === 'check' 使用
  completedAt?: Date;  // 仅 type === 'check' 使用，最近一次完成时间
  createdAt: Date;
  updatedAt: Date;
}
```

打卡型目标（`type: 'check'`）只作为提醒存在，不计入时长统计，也不在 Dashboard / 趋势分析中累计。

### Category

```typescript
interface Category extends Syncable {
  id: string;            // 预设类别为固定 ID，自定义类别为 UUID
  name: string;
  color: string;         // 颜色存储在 DB 中（v5 迁移后）
  isPreset?: boolean;
  order: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

预设类别：

| id | 中文名 | 默认颜色 |
|---|---|---|
| study | 学习 | #1890FF |
| work | 工作 | #40A9FF |
| daily | 日常 | #FFA940 |
| exercise | 运动 | #FF7A45 |
| rest | 休息 | #9254DE |
| entertainment | 娱乐 | #B37FEB |

用户可通过「维护 → 类别管理」添加自定义类别、编辑名称和颜色、删除自定义类别。颜色获取：`categoryStore.getCategoryColor(id)`，未知 id 返回 `#d9d9d9`。

### 同步辅助实体

**SyncOperation**（操作日志）：记录本地数据变更，由 `syncDb.ts` 自动写入。

**SyncMetadata**：`deviceId`（本设备 UUID）、`lastProcessedTimestamp`（Pull 游标）、`lastSnapshotPullTimestamps`（各设备 snapshot 上次拉取时间）。

### Dexie Schema

数据库名 `TimeTrackerDB`：

```
entries        → id, startTime, endTime, activity, categoryId, goalId, ...
goals          → id, date, name, color, ...
categories     → id, order, name, icon, ...
syncMetadata   → key, value, updatedAt
syncOperations → id, timestamp, deviceId, tableName, recordId, type, data, synced
```

### db.ts vs syncDb.ts

| | `db.ts` | `syncDb.ts` |
|---|---|---|
| 用途 | 直接读取（查询、分析） | 写操作（增删改） |
| 操作日志 | 不记录 | 自动记录 SyncOperation |
| 版本管理 | 不处理 | 自动递增 version，设置 deviceId |

**规则**：读用 `db`，写用 `syncDb`。直接写 `db` 会导致变更不被同步。

---

## dataService

`src/services/dataService.ts` 是统一数据访问层。stores 通过它写入数据，AI tools、分析服务、维护页面通过它读写数据。

### API 概览

```typescript
dataService.entries.query(filters?)        // 查询记录（按日期、分类、目标过滤）
dataService.entries.add(entry)             // 新增记录
dataService.entries.update(id, updates)    // 更新记录
dataService.entries.delete(id)             // 软删除记录
dataService.entries.batchAdd(entries[])    // 批量新增

dataService.entries.findGaps(options)      // 查找时间空白
dataService.entries.findSleepGaps(options) // 查找睡觉候选
dataService.entries.findOverlaps(options)  // 查找时间重叠
dataService.entries.findAnomalies(options) // 查找异常记录

dataService.goals.query(filters?)
dataService.goals.add(goal) / update(id, updates) / delete(id)
dataService.categories.list()
```

读操作走 `db`，写操作走 `syncDb`。

### 查询日期归属语义

当前 `dataService.entries.query(filters?)` 的日期过滤仍偏向 `startTime` 落桶：一条跨日记录主要归属到它开始的那一天。Timeline / EntryList / TimeEntryForm 自动时间选择则采用 overlap 语义：只要记录和某一天有交集，就算那一天可见。

例子：`5/17 23:30 -> 5/18 00:30` 在视觉时间轴上应该同时出现在 `5/17` 和 `5/18`；但使用 `startTime` 落桶的统计查询可能只把它算到 `5/17`，从而漏掉 `5/18 00:00-00:30` 这段。这个问题属于数据查询/统计口径统一，不属于 TimeEntryForm 自身机制。

### 维护方法

- **findGaps**：按天遍历，计算相邻记录间的空白（含第一条前、最后一条后、整天无记录）
- **findSleepGaps**：在 findGaps 基础上筛选与睡眠窗口（默认 22:00-10:00）有交集的 gap
- **findOverlaps**：按 startTime 升序检查相邻记录是否重叠
- **findAnomalies**：检测 `reversed_time`（结束早于开始）、`too_long`（超 12h）、`stale_active`（计时超 24h）

### 数据维护页面（MaintenancePage）

仅桌面端可见。**睡觉补录 Tab**：配置 → 扫描 → 预览/勾选 → 确认补录。**数据校验 Tab**：扫描重叠和异常 → 逐条截断或删除。

## TimeEntryForm 自动时间选择（应用核心机制）

Chrono 的使用理念是"连续记录生活流水账"，所以主表单的 `startTime` / `endTime` 自动设置是核心 UX。它不是 store 里集中维护的一块状态，而是 `TimeEntryForm` 本地 state，由多条 UI / effect 路径显式调用 `setStartTime(...)` 和 `setEndTime(...)` 写入。

完整机制已经抽到独立文档：[TimeEntryForm 自动时间选择机制](auto-time-selection.md)。修改这块代码前，请先读那篇文档。

## 智能预选（metadataPredictor）

录入活动时的类别/目标自动预选由 `src/services/metadataPredictor.ts` 提供，主表单和 Quick Capture 都会调用。当前策略、已知误选问题（如“上厕所”→“recogem文章”）和优化方向已抽到独立文档：[智能预选（metadataPredictor）](metadata-predictor.md)。
