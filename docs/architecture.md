# 架构概览

## 项目简介

**Chrono** 是一款本地优先的多平台时间追踪应用，使用相同的 Web 代码库同时支持 Web、Android、macOS、IOS 四个平台。

## 使用理念

### 单人使用

本应用为**个人使用**设计。无论是否联网，都是一个人记录自己日常生活的时间流水。

**设计理念：** 记录生活流水账。例如 11:00-12:18 在学习，12:18-12:47 在吃饭，12:47-13:00 在排队……以此完整还原一天的时间使用。建议利用琐碎时间（排队、等人等）进行记录，保持记录的连续性。

### 目标管理理念

本应用的目标管理是**基于每天的时间投入统计**。每天创建目标，统计该目标关联了多少时间记录、总共花了多少时间。不存在"完成/未完成/进行中"这类状态指标——核心关注的是**你在每件事上投入了多少时间**。

## 技术栈

| 层次 | 技术 |
|---|---|
| UI | React 18 + Ionic React 8 + TypeScript |
| 状态管理 | Zustand 5 |
| 持久化 | Dexie.js 4（IndexedDB，数据库名 `TimeTrackerDB`） |
| 构建（Web/Android） | Vite 7 |
| 构建（macOS） | Electron 26（通过 `@capacitor-community/electron`） |
| 多平台桥接 | Capacitor 7 |
| 日期处理 | Day.js |
| 图表 | Recharts 3 |

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
| export | `ExportPage` | 数据导出 / 同步配置 / AI 设置 |

### Desktop 布局（侧边栏，6 个导航项）

| Key | 组件 | 说明 |
|---|---|---|
| records | `RecordsPage` | 同移动端 |
| goals | `GoalManager` | 同移动端 |
| dashboard | `Dashboard` | 数据统计总览（仅桌面端） |
| ai | `AIAssistant` | AI 助手（仅桌面端） |
| maintenance | `MaintenancePage` | 数据维护（仅桌面端） |
| export | `ExportPage` | 设置与数据管理 |

`TrendPage` 和 `GoalAnalysisPage` 是 Dashboard 内的二级页面，由 Dashboard 内的按钮跳转进入，并有返回 Dashboard 的按钮，不出现在侧边栏导航中。

## 目录结构

```
src/
├── App.tsx                    # 根组件：路由、布局切换、启动时 Pull
├── App.css
├── types/                     # 共享 TypeScript 类型
│
├── stores/                    # Zustand 状态管理（6 个 store）
│   ├── entryStore.ts          # 时间记录 CRUD + 计时器
│   ├── goalStore.ts           # 目标 CRUD
│   ├── categoryStore.ts       # 分类（6 个预设 + 自定义类别 CRUD）
│   ├── dateStore.ts           # 全局选中日期
│   ├── syncStore.ts           # 同步状态 + 自动同步开关
│   └── aiStore.ts             # AI 配置 + 对话历史
│
├── services/                  # 数据层与业务逻辑
│   ├── db.ts                  # Dexie Schema、Syncable 接口、辅助函数
│   ├── syncDb.ts              # 同步感知的 CRUD 封装（自动记录 oplog）
│   ├── dataService.ts         # 高层数据查询 + 维护工具
│   ├── syncEngine.ts          # 同步引擎（Push / Pull / LWW 合并）
│   ├── syncConfig.ts          # 同步配置管理（localStorage）
│   ├── syncToast.ts           # 同步状态通知事件总线
│   ├── syncDebugTools.ts      # 控制台调试工具（window.syncDebug）
│   ├── oss.ts                 # 阿里云 OSS 操作封装
│   ├── export.ts              # JSON 导入导出
│   ├── goalSuggester.ts       # 晨间目标智能建议（未完成 + 高频目标，Top 5）
│   ├── metadataPredictor.ts   # 录入时自动预测类别和目标（精确/子串匹配，纯本地）
│   ├── autoPush.ts            # 数据变更后自动触发增量 Push（封装 sync 协调逻辑）
│   ├── ai/                    # AI 助手（见 ai-assistant.md）
│   └── analysis/              # 数据分析处理器
│       ├── processor.ts       # 数据加载 + 转换管道
│       ├── goalAnalysisProcessor.ts
│       └── goalCluster.ts
│
├── components/
│   ├── RecordsPage/
│   ├── TimeTracker/           # TimeEntryForm
│   ├── TimelineView/          # 24 小时时间轴
│   ├── EntryList/             # 列表 + 编辑弹窗 + 滑动删除
│   ├── GoalManager/           # 目标 CRUD + TimeInjectionMatrix
│   ├── Dashboard/             # 数据统计总览
│   ├── TrendPage/             # 趋势分析
│   ├── GoalAnalysisPage/      # 目标分析
│   ├── AIAssistant/           # AI 对话 + 设置
│   ├── MaintenancePage/       # 数据维护（睡觉补录 + 数据校验）
│   ├── ExportPage/            # 导出 / 设置
│   ├── SyncManagementPage/    # 同步管理界面
│   ├── Desktop/               # DesktopSidebar
│   ├── SyncButton/            # SyncButton（手动同步按钮，桌面/导出页）
│   └── common/                # SyncIndicator、SyncToastListener、WheelTimePicker
│
├── config/
│   └── categoryColors.ts      # 预设类别默认值 + 自定义类别调色板
│
├── hooks/
│   ├── useAppToast.ts         # 封装 useIonToast，自动注入 top-toast 定位 CSS
│   ├── useDarkMode.ts         # 暗色模式检测
│   └── useIOSTimePicker.ts    # iOS 原生滚轮时间选择器 Hook
│
└── utils/
    └── appToast.ts            # Ionic toast 选项装饰工具（注入 app-top-toast CSS 类）
```

## 环境变量

复制 `.env.example` 为 `.env.local`，OSS 和 AI 配置均为可选：

```env
# 同步（可选）
VITE_OSS_REGION=oss-cn-hangzhou
VITE_OSS_BUCKET=your-bucket-name
VITE_OSS_ACCESS_KEY_ID=your-access-key-id
VITE_OSS_ACCESS_KEY_SECRET=your-access-key-secret

# AI 助手（可选）
VITE_AI_PROVIDER=qwen
VITE_AI_BASE_URL=https://...
VITE_AI_API_KEY=your-api-key
VITE_AI_MODEL=qwen3.6-max-preview
```

> **优先级**：应用内配置（localStorage）> .env 环境变量。两项均未配置时，对应功能不可用，但应用正常运行。

## 开发命令

```bash
npm run dev          # Vite 开发服务器（http://localhost:5173）
npm run build        # TypeScript 编译 + Vite 生产构建
npm run lint         # ESLint 检查（项目唯一的代码质量检查）
npm run preview      # 预览生产构建
npm run ai:debug     # AI 助手 CLI 调试

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
  updatedAt: Date;                   // LWW 冲突解决时间戳
}
```

**软删除**：应用中的"删除"操作将 `deleted` 置为 `true`，记录不会从 DB 中物理移除，以确保删除操作能同步到其他设备。

### TimeEntry

```typescript
interface TimeEntry extends Syncable {
  id: string;              // UUID
  startTime: Date;
  endTime: Date | null;    // null 表示当前正在计时
  activity: string;        // 活动描述（用户输入）
  categoryId: string | null;  // 关联分类 ID
  goalId: string | null;      // 关联目标 ID
  createdAt: Date;
  updatedAt: Date;
}
```

`endTime === null` 表示正在进行中的计时，任何时刻最多一条。

### Goal

```typescript
interface Goal extends Syncable {
  id: string;      // UUID
  name: string;
  date: string;    // YYYY-MM-DD
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

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

### 维护方法

- **findGaps**：按天遍历，计算相邻记录间的空白（含第一条前、最后一条后、整天无记录）
- **findSleepGaps**：在 findGaps 基础上筛选与睡眠窗口（默认 22:00-10:00）有交集的 gap
- **findOverlaps**：按 startTime 升序检查相邻记录是否重叠
- **findAnomalies**：检测 `reversed_time`（结束早于开始）、`too_long`（超 12h）、`stale_active`（计时超 24h）

### 数据维护页面（MaintenancePage）

仅桌面端可见。**睡觉补录 Tab**：配置 → 扫描 → 预览/勾选 → 确认补录。**数据校验 Tab**：扫描重叠和异常 → 逐条截断或删除。
