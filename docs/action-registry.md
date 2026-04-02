# Action Registry — AI-First 操作注册表

> **分支：** `feat/ai`（尚未合并到 main）  
> **实现日期：** 2026-04-02 ~ 2026-04-03  
> **设计方案：** [设计文档](superpowers/specs/2026-04-02-ai-first-action-registry-design.md)  
> **实施计划：** [实施计划](superpowers/plans/2026-04-02-ai-first-action-registry.md)  
> **变更规模：** 32 文件，+3721 / -63 行

## 概述

Action Registry 是 AI 助手从"只读分析工具"升级为"可读可写智能助手"的核心基础架构。它在 AI 层（`toolCallEngine`）和数据层（`dataService` / stores）之间引入了一个**自描述的 Action 中间层**，使得：

1. AI 助手能够**创建、修改、删除**时间记录和目标（不再只能查询）
2. 所有可执行操作统一注册、统一管理，tool definitions **自动从 registry 生成**
3. 写入操作带有**风险分级 + 用户确认流程**，防止误操作
4. 架构上与 AI 框架解耦——未来加 MCP/REST adapter 零重构核心

### 与合并前 main 分支的关系

这个功能在 `feat/ai` 分支上独立开发。`main` 分支会继续正常维护 UI 和基础功能。等功能稳定后再合并。合并时需注意：

- `src/services/ai/toolCallEngine.ts` 有较大改动（导入来源从 `toolDefinitions` 变为 `actionRegistry`，新增确认流程）
- `src/components/AIAssistant/AIAssistant.tsx` 新增了确认状态管理
- `src/services/ai/toolDefinitions.ts` 已标记为 deprecated，但仍保留（提供 `ToolDefinition` 类型导出）

---

## 架构

```
┌───────────────────────────────────────────────────┐
│                   消费者层                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ AI 助手      │  │ 未来: MCP    │  │ 未来: UI │ │
│  │ (toolCall    │  │  Adapter     │  │  快捷操作 │ │
│  │  Engine)     │  │              │  │          │ │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│         └──────────────────┼───────────────┘       │
│                    ┌───────▼────────┐              │
│                    │ Action Registry │              │
│                    │  (16 actions)  │              │
│                    └───────┬────────┘              │
│              ┌─────────────┼─────────────┐        │
│              ▼             ▼             ▼         │
│          read (3)     write (8)   maintenance (5) │
│                    ┌───────┴────────┐              │
│                    │ dataService /  │              │
│                    │ stores / syncDb│              │
│                    └────────────────┘              │
└───────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 理由 |
|---|---|
| Action 中间层而非直接扩展 tool definitions | 与 AI 框架解耦，未来可接 MCP/REST/UI 快捷操作 |
| 每个 action 一个文件 | 职责清晰、易于增删、避免巨型文件 |
| 风险分级（none / low / high） | 读操作无需确认，低风险简单确认，高风险详细变更列表 |
| Promise-based 确认流程 | 暂停 tool call 循环 → 等待用户确认 → 恢复执行，无需修改 LLM 协议 |
| 不修改 dataService / stores | 零风险，action handler 是现有 API 的消费者 |

---

## 文件结构

```
src/services/actions/
├── types.ts                 # 核心类型定义
├── registry.ts              # ActionRegistry 单例
├── index.ts                 # 注册全部 16 个 action，导出 registry
├── read/
│   ├── queryTimeEntries.ts  # 查询时间记录（从旧 toolDefinitions 迁移）
│   ├── listCategories.ts    # 列出分类
│   └── listGoals.ts         # 列出目标
├── write/
│   ├── addEntry.ts          # 新增时间记录
│   ├── updateEntry.ts       # 修改时间记录
│   ├── deleteEntry.ts       # 删除时间记录（软删除）
│   ├── mergeEntries.ts      # 合并多条记录
│   ├── splitEntry.ts        # 拆分一条记录
│   ├── addGoal.ts           # 新增目标
│   ├── updateGoal.ts        # 修改目标
│   └── deleteGoal.ts        # 删除目标（软删除）
└── maintenance/
    ├── findOverlaps.ts      # 检测时间重叠
    ├── findGaps.ts          # 检测时间空隙
    ├── findAnomalies.ts     # 检测异常记录
    ├── autoCategorize.ts    # 自动分类
    └── batchUpdate.ts       # 批量修改
```

**修改的现有文件：**

| 文件 | 改动说明 |
|---|---|
| `src/services/ai/toolCallEngine.ts` | 导入 `actionRegistry` 替代 `TOOL_DEFINITIONS` / `executeTool`；新增 `onConfirmRequired` 回调；system prompt 动态注入写操作指引 |
| `src/services/ai/toolDefinitions.ts` | 标记为 deprecated，仅保留 `ToolDefinition` 类型导出 |
| `src/components/AIAssistant/AIAssistant.tsx` | 新增 `pendingConfirmation` 状态、确认/取消 handler、渲染 ConfirmationCard |
| `src/components/AIAssistant/ConfirmationCard.tsx` | 新增：确认卡片组件 |
| `src/components/AIAssistant/ConfirmationCard.css` | 新增：确认卡片样式 |

---

## 核心类型

```typescript
// src/services/actions/types.ts

type ActionCategory = 'read' | 'write' | 'maintenance';
type RiskLevel = 'none' | 'low' | 'high';

interface ActionDefinition {
  name: string;                    // AI tool name，如 'add_entry'
  description: string;             // 自然语言描述，供 AI 理解
  category: ActionCategory;
  risk: RiskLevel;
  parameters: Record<string, unknown>;  // JSON Schema 格式
  handler: (params) => Promise<ActionResult>;
  confirm?: (params) => Promise<ConfirmationCard>;  // 写操作必须有
}

interface ActionResult {
  success: boolean;
  data?: unknown;
  message: string;  // 自然语言结果，供 AI 回传给用户
}

interface ConfirmationCard {
  title: string;
  description: string;
  changes: ConfirmationChange[];   // 具体变更清单
  risk: RiskLevel;
}
```

---

## 16 个 Action 一览

### 读取（3 个，risk: none）

| Action | 说明 | 参数 |
|---|---|---|
| `query_time_entries` | 查询时间记录 + 统计 | `start_date`, `end_date`, `category?`, `goal?` |
| `list_categories` | 列出全部分类 | 无 |
| `list_goals` | 列出日期范围内目标 | `start_date`, `end_date` |

### 写入（8 个）

| Action | Risk | 说明 | 关键参数 |
|---|---|---|---|
| `add_entry` | low | 新增时间记录 | `date`, `startTime`, `endTime`, `categoryName`, `description?` |
| `update_entry` | low | 修改时间记录 | `entryId`, `startTime?`, `endTime?`, `categoryName?`, `description?` |
| `delete_entry` | high | 软删除时间记录 | `entryId` |
| `merge_entries` | high | 合并多条相邻记录 | `entryIds` (数组) |
| `split_entry` | low | 在指定时间点拆分记录 | `entryId`, `splitTime` |
| `add_goal` | low | 新增目标 | `date`, `name`, `targetMinutes` |
| `update_goal` | low | 修改目标 | `goalId`, `name?`, `targetMinutes?` |
| `delete_goal` | high | 软删除目标 | `goalId` |

### 维护（5 个）

| Action | Risk | 说明 |
|---|---|---|
| `find_overlaps` | none | 检测指定日期范围内时间重叠 |
| `find_gaps` | none | 检测指定日期范围内时间空隙（>= 阈值分钟） |
| `find_anomalies` | none | 检测异常记录（超长、超短、未结束） |
| `auto_categorize` | low | 根据历史记录推断未分类记录的分类 |
| `batch_update` | high | 批量修改符合条件的记录（分类、描述等） |

### ID 匹配机制

所有写操作的 `entryId` / `goalId` 支持**前缀匹配**（最少 8 字符 UUID 前缀）。`query_time_entries` 返回结果中会带上每条记录的前 8 位 ID，AI 可直接引用。

### 分类名模糊匹配

`addEntry`、`updateEntry`、`autoCategorize`、`batchUpdate` 等操作支持按分类名称模糊查找，无需用户记住分类 ID。

---

## 确认流程

写操作执行前会经过**建议 → 确认 → 执行**三步：

```
1. AI 调用 tool（如 delete_entry）
2. toolCallEngine 检测到 action 有 confirm 方法 → 调用 confirm(params)
3. confirm() 返回 ConfirmationCard（变更描述 + 风险级别）
4. toolCallEngine 调用 onConfirmRequired(card) → 返回 Promise<boolean>
5. AIAssistant 渲染 ConfirmationCard 组件，等待用户点击
6. 用户点击"确认执行" → Promise resolve(true) → handler 执行
   用户点击"取消"     → Promise resolve(false) → 返回取消信息给 AI
7. 卡片显示"✓ 已执行"或"已取消"状态 1.5 秒后消失
```

### ConfirmationCard UI

- 根据风险级别显示不同颜色边框（低风险：蓝色，高风险：红色）
- 列出具体变更清单（创建 ＋ / 修改 ✎ / 删除 ✕）
- 确认后显示已解决状态（1.5 秒后自动消失）

---

## 如何新增 Action

1. 在对应分类目录（`read/`、`write/`、`maintenance/`）创建新文件
2. 定义 `ActionDefinition` 对象，包含 name、description、category、risk、parameters、handler
3. 如果是写操作，必须实现 `confirm` 方法
4. 在 `src/services/actions/index.ts` 中 import 并 `actionRegistry.register()`
5. 完成——toolCallEngine 会自动发现新 action 并生成对应的 AI tool definition

无需修改 `toolCallEngine.ts` 或 `toolDefinitions.ts`。

### 数据变更规范

所有写入 handler 必须遵循现有 mutation chain：

```typescript
// 1. 通过 dataService 写入（内部经 syncDb 追踪变更）
await dataService.entries.add(newEntry);

// 2. 刷新 store 状态
await useEntryStore.getState().loadEntries();

// 3. 触发同步
autoPush('action: add_entry');
```

---

## Git 提交历史

| 提交 | 说明 |
|---|---|
| `3a966e3` | docs: 设计方案文档 |
| `6bbe4c0` | docs: 实施计划 |
| `6762029` | feat: Action Registry 核心类型和注册表 |
| `2a716b3` | feat: 迁移 3 个只读工具到 Action Registry |
| `ee7e969` | refactor: toolCallEngine 使用 Action Registry |
| `df13889` | feat: 确认卡片 UI 组件 |
| `a15aff1` | feat: 时间记录 CRUD 写操作 |
| `bad1808` | feat: 合并与拆分操作 |
| `fc14750` | feat: 目标 CRUD 写操作 |
| `e07fba0` | feat: 维护操作（重叠、空隙、异常、自动分类、批量更新） |
| `0d0e87e` | chore: 标记旧 toolDefinitions 为 deprecated |
| `a6150cd` | fix: 确认卡片已解决状态显示 + listGoals 错误一致性 |

---

## 合并注意事项

当你准备将 `feat/ai` 合并到 `main` 时：

1. **冲突风险文件：**
   - `src/services/ai/toolCallEngine.ts` — 最大改动，如果 main 也修改了此文件需仔细合并
   - `src/components/AIAssistant/AIAssistant.tsx` — 新增了状态和 handler
   - `src/App.css` 和 `src/App.tsx` — 有小幅 UI 调整（同步指示器等），可能与 main 的 UI 更新冲突

2. **无需担心的文件：**
   - `src/services/actions/` 整个目录是新增的，不会有冲突
   - `src/components/AIAssistant/ConfirmationCard.tsx` + `.css` 是新增文件

3. **合并后验证：**
   - `npm run build` 确认编译通过
   - 手动测试 AI 助手的只读查询（回归测试）
   - 手动测试写操作的确认流程
   - 检查 `autoPush` 是否正常触发同步

4. **旧代码清理（合并后可选）：**
   - `src/services/ai/toolDefinitions.ts` 中的 `TOOL_DEFINITIONS` 数组和 `executeTool` 函数已不再被调用，可以删除，仅保留 `ToolDefinition` 类型
   - 或将 `ToolDefinition` 类型移到 `actions/types.ts`，彻底移除 `toolDefinitions.ts`

---

## 未来扩展方向

此架构为以下扩展预留了空间：

- **MCP Adapter**：实现 `MCPServer` 类，内部调用 `actionRegistry`，暴露为 MCP 工具
- **REST API Adapter**：Express/Hono 路由映射到 `actionRegistry.get(name).handler()`
- **UI 快捷操作**：某些高频 action 可直接绑定到 UI 按钮，绕过 AI 对话
- **移动端支持**：目前仅桌面端，action 本身平台无关，扩展到移动端只需 UI 适配
- **权限控制**：基于 `risk` 级别实现更细粒度的权限管理
- **Action 组合**：多个 action 组成 workflow（如"整理今天的记录" = find_overlaps + merge_entries + auto_categorize）
