# AI-First Action Registry 设计方案

> 日期：2026-04-02  
> 状态：Draft  
> 方案：B — Action Registry 模式

## 1. 目标与约束

### 背景
Chrono 当前 AI 助手仅有 3 个只读工具（`query_time_entries`、`list_categories`、`list_goals`），只能查询数据，无法修改。AI 助手仅在桌面端以对话框形式存在。

### 目标
1. **内部 AI 助手从"只读分析"升级为"可读可写的智能助手"**——能操作时间记录、管理目标、维护数据质量
2. **引入 Action Registry 中间层**——让所有可操作行为自描述、统一管理，AI 工具定义自动生成
3. **为未来外部 Agent 接入预留空间**——registry 与 AI 框架解耦，未来加 MCP/REST adapter 零重构核心
4. **先桌面端，后续可扩展到移动端**

### 约束
- 不重写现有数据层（`dataService` / `syncDb`），action handler 内部调用现有 API
- 保持现有 mutation chain：`dataService.X.op()` → `store.loadX()` → `autoPush()`
- 所有写入操作必须经用户确认（建议 → 确认 → 执行），未来可按风险分级
- 不引入服务端组件，一切在浏览器本地执行
- 不破坏现有 AI 只读查询功能——迁移为 action 后行为完全一致

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    消费者层                           │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ AI 助手       │  │ 未来: MCP    │  │ 未来: UI  │  │
│  │ (toolCall     │  │  Adapter     │  │  快捷操作  │  │
│  │  Engine)      │  │              │  │           │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                 │                │         │
│  ┌──────▼─────────────────▼────────────────▼──────┐  │
│  │            Action Registry                     │  │
│  │                                                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  ActionDefinition                        │  │  │
│  │  │  ├─ name: string                         │  │  │
│  │  │  ├─ description: string (自然语言)        │  │  │
│  │  │  ├─ category: 'read'|'write'|'maintenance' │  │  │
│  │  │  ├─ risk: 'none' | 'low' | 'high'       │  │  │
│  │  │  ├─ parameters: JSONSchema               │  │  │
│  │  │  ├─ handler: (params) => ActionResult     │  │  │
│  │  │  └─ confirm?: (params) => ConfirmCard     │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│         │                                            │
│  ┌──────▼──────────────────────────────────────────┐ │
│  │  dataService / stores / syncDb (现有数据层)      │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 关键层次

| 层 | 职责 | 改动程度 |
|---|---|---|
| **Action Registry** | 新增。注册、查找、执行 action；生成 AI tool definitions | 新文件 |
| **Action Definitions** | 新增。每个 action 一个文件，自描述 schema + handler | 新文件（~15个） |
| **toolCallEngine** | 改造。从 registry 自动获取 tool definitions，增加确认流程 | 中等改动 |
| **AI Chat UI** | 改造。增加确认卡片组件、操作结果反馈 | 中等改动 |
| **dataService / stores** | 不动。action handler 是 registry 的消费者 | 无改动 |

---

## 3. Action Registry 核心设计

### 3.1 ActionDefinition 类型

```typescript
// src/services/actions/types.ts

export type ActionCategory = 'read' | 'write' | 'maintenance';
export type RiskLevel = 'none' | 'low' | 'high';

export interface ActionResult {
  success: boolean;
  data?: unknown;           // 结构化数据（供程序消费）
  message: string;          // 自然语言结果描述（供 AI/用户阅读）
}

export interface ConfirmationCard {
  title: string;            // "合并 3 条记录"
  description: string;      // 操作详情的自然语言描述
  changes: ConfirmationChange[];  // 具体变更列表
  risk: RiskLevel;
}

export interface ConfirmationChange {
  type: 'create' | 'update' | 'delete';
  entity: string;           // 'entry' | 'goal' | 'category'
  summary: string;          // "删除记录：11:00-12:00 学习"
}

export interface ActionDefinition {
  /** 唯一标识，同时也是 AI tool name (snake_case) */
  name: string;

  /** 自然语言描述，直接用于 AI tool description */
  description: string;

  /** 操作类别 */
  category: ActionCategory;

  /** 风险等级：none=无确认，low/high=需确认（当前阶段统一确认） */
  risk: RiskLevel;

  /** JSON Schema 格式的参数定义，直接用于 AI tool parameters */
  parameters: Record<string, unknown>;

  /** 执行函数 */
  handler: (params: Record<string, unknown>) => Promise<ActionResult>;

  /**
   * 可选：生成确认卡片。
   * 当 risk != 'none' 时，引擎先调用 confirm 获取预览，
   * 展示给用户确认后再调用 handler。
   * 若未提供 confirm，引擎根据 description + params 自动生成简单确认。
   */
  confirm?: (params: Record<string, unknown>) => Promise<ConfirmationCard>;
}
```

### 3.2 Registry 实现

```typescript
// src/services/actions/registry.ts

import type { ActionDefinition } from './types';

class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  register(action: ActionDefinition): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action "${action.name}" already registered`);
    }
    this.actions.set(action.name, action);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /** 按类别筛选 */
  getByCategory(category: ActionCategory): ActionDefinition[] {
    return this.getAll().filter(a => a.category === category);
  }

  /** 自动生成 OpenAI tools 格式的工具声明（兼容现有 ToolDefinition 类型） */
  toToolDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return this.getAll().map(action => ({
      type: 'function' as const,
      function: {
        name: action.name,
        description: action.description,
        parameters: action.parameters,
      },
    }));
  }
}

export const actionRegistry = new ActionRegistry();
```

### 3.3 文件结构

```
src/services/actions/
├── types.ts              # ActionDefinition、ActionResult 等类型
├── registry.ts           # ActionRegistry 单例 + toToolDefinitions()
├── index.ts              # 统一导出 + 注册所有 actions
│
├── read/                 # 只读查询 actions（迁移自现有 toolDefinitions）
│   ├── queryTimeEntries.ts
│   ├── listCategories.ts
│   └── listGoals.ts
│
├── write/                # 写入操作 actions
│   ├── addEntry.ts
│   ├── updateEntry.ts
│   ├── deleteEntry.ts
│   ├── mergeEntries.ts
│   ├── splitEntry.ts
│   ├── addGoal.ts
│   ├── updateGoal.ts
│   └── deleteGoal.ts
│
└── maintenance/          # 数据维护 actions
    ├── findOverlaps.ts
    ├── findGaps.ts
    ├── findAnomalies.ts
    ├── autoCategorize.ts
    └── batchUpdate.ts
```

---

## 4. Action 清单

### 4.1 只读 Actions（从现有工具迁移）

| Action | 描述 | 风险 | 迁移说明 |
|---|---|---|---|
| `query_time_entries` | 按时间/分类/目标查询记录 | none | 现有 `queryTimeEntries()` 原样迁入 |
| `list_categories` | 列出所有活动类别 | none | 现有 `listCategories()` 原样迁入 |
| `list_goals` | 列出日期范围内的目标 | none | 现有 `listGoals()` 原样迁入 |

### 4.2 写入 Actions（新增）

| Action | 描述 | 风险 | 典型场景 |
|---|---|---|---|
| `add_entry` | 创建一条时间记录 | low | "帮我记录今天 14:00-15:30 在学习数学" |
| `update_entry` | 修改一条记录的活动名/分类/目标/时间 | low | "把刚才的记录分类改成工作" |
| `delete_entry` | 软删除一条记录 | high | "删除今天 10 点那条记录" |
| `merge_entries` | 合并多条相邻记录为一条 | high | "把今天下午的 3 条学习记录合并" |
| `split_entry` | 将一条记录按时间点拆分为两条 | low | "把这条 2 小时的记录从 15:00 拆开" |
| `add_goal` | 为指定日期创建目标 | low | "帮我创建明天的学习目标" |
| `update_goal` | 修改目标名称/颜色 | low | "把目标名改成'期末复习'" |
| `delete_goal` | 软删除目标 | high | "删除今天的 XX 目标" |

### 4.3 维护 Actions（新增）

| Action | 描述 | 风险 | 典型场景 |
|---|---|---|---|
| `find_overlaps` | 检测时间重叠的记录 | none | "检查今天有没有时间重叠" |
| `find_gaps` | 检测时间空隙 | none | "今天有哪些时间没有记录" |
| `find_anomalies` | 检测异常记录（倒序时间/超长/僵尸计时） | none | "帮我检查下数据有没有问题" |
| `auto_categorize` | 根据活动名推断并补全缺失分类 | low | "帮我把没分类的记录自动归类" |
| `batch_update` | 批量修改记录的分类或目标 | high | "把今天所有'学习'分类的记录关联到'期末复习'目标" |

---

## 5. 确认流程设计

### 5.1 执行流程

```
用户发送消息
    │
    ▼
AI 决定调用某个 action (tool_call)
    │
    ▼
Engine 解析 action name + params
    │
    ├─ risk == 'none' (只读)
    │   └─ 直接执行 handler → 返回结果给 AI 继续推理
    │
    └─ risk == 'low' | 'high' (写入/维护)
        │
        ▼
    调用 action.confirm(params) 生成 ConfirmationCard
        │
        ▼
    Engine 暂停工具调用循环
        │
        ▼
    UI 渲染确认卡片（显示变更预览）
        │
        ├─ 用户点击「确认执行」
        │   └─ 调用 handler → 返回结果 → 恢复循环
        │       │
        │       ▼
        │   store.loadX() → autoPush() (保持 mutation chain)
        │
        └─ 用户点击「取消」
            └─ 返回 "用户取消了此操作" → 恢复循环，AI 知晓
```

### 5.2 toolCallEngine 改造

核心变化：

1. **工具声明来源**：`TOOL_DEFINITIONS` 常量 → `actionRegistry.toToolDefinitions()`
2. **工具执行**：硬编码 `switch` → `actionRegistry.get(name).handler(args)`
3. **确认中断**：写入操作时暂停循环，等待用户确认

```typescript
// toolCallEngine.ts 的核心改造（伪代码）

// 旧：import { TOOL_DEFINITIONS, executeTool } from './toolDefinitions';
// 新：
import { actionRegistry } from '../actions/registry';

// 工具声明
const toolDefs = actionRegistry.toToolDefinitions();

// 工具执行（在循环内）
for (const tc of response.tool_calls) {
  const action = actionRegistry.get(tc.function.name);
  if (!action) { /* 错误处理 */ continue; }

  const args = JSON.parse(tc.function.arguments);

  if (action.risk !== 'none') {
    // 生成确认卡片
    const card = action.confirm
      ? await action.confirm(args)
      : autoGenerateConfirmCard(action, args);

    // 暂停循环，通知 UI 渲染确认卡片
    const confirmed = await callbacks.onConfirmRequired(card);

    if (!confirmed) {
      // 用户取消 → 注入取消消息给 AI
      messages.push({
        role: 'tool',
        content: '用户取消了此操作。',
        tool_call_id: tc.id,
      });
      continue;
    }
  }

  // 执行
  const result = await action.handler(args);
  messages.push({
    role: 'tool',
    content: result.message,
    tool_call_id: tc.id,
  });
}
```

### 5.3 新增 Callback

```typescript
export interface ToolCallEngineCallbacks {
  // ... 现有 callbacks 保持不变
  onPhase: (phase: string, detail?: string, debugInfo?: string) => void;
  onChunk: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (info: ToolCallInfo) => void;

  // 新增：确认请求
  onConfirmRequired: (card: ConfirmationCard) => Promise<boolean>;
}
```

---

## 6. AI Chat UI 改造

### 6.1 确认卡片组件

在对话流中，当 AI 请求写入操作时，渲染一个内嵌确认卡片：

```
┌─────────────────────────────────────────┐
│  🔧 添加时间记录                         │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ ＋ 创建记录                         │  │
│  │   14:00-15:30 学习数学              │  │
│  │   分类：学习  目标：期末复习          │  │
│  └────────────────────────────────────┘  │
│                                          │
│        [ 取消 ]    [ ✓ 确认执行 ]        │
└─────────────────────────────────────────┘
```

**设计要点**：

- 卡片是**消息流的一部分**，出现在 AI 消息气泡内
- 变更列表用颜色区分类型：绿色=创建，蓝色=修改，红色=删除
- 确认/取消后，卡片变为只读状态，显示执行结果或"已取消"
- high risk 操作的卡片使用更醒目的警告样式

### 6.2 操作结果通知

handler 执行成功后：
- AI 继续基于结果生成总结（如"已添加记录：14:00-15:30 学习数学"）
- 相关 store 自动重新加载（`loadEntries()` / `loadGoals()`），UI 实时更新

### 6.3 系统提示词升级

在 `buildSystemPrompt()` 中增加写入工具的使用指南：

```
## 操作工具使用指南
1. 当用户明确要求新增/修改/删除记录时，使用对应的写入工具
2. 在使用写入工具之前，先用查询工具确认操作对象（如 "删除那条记录" → 先查询找到具体记录）
3. 合并记录时，先查询要合并的记录列表，确认后调用 merge_entries
4. 数据维护操作应先诊断（find_overlaps/find_anomalies），再提出修复建议
5. 不要在用户未请求时主动修改数据
6. 写入操作会触发用户确认弹窗，用户可能会取消——如果取消了，尊重用户决定
```

---

## 7. 各 Action 详细设计

### 7.1 `add_entry`

```typescript
{
  name: 'add_entry',
  description: '创建一条时间记录。需要开始时间和结束时间，活动描述，可选分类和目标。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      date: { type: 'string', description: '记录日期，YYYY-MM-DD' },
      start_time: { type: 'string', description: '开始时间，HH:mm' },
      end_time: { type: 'string', description: '结束时间，HH:mm' },
      activity: { type: 'string', description: '活动描述' },
      category: { type: 'string', description: '可选，类别名称' },
      goal: { type: 'string', description: '可选，目标名称' },
    },
    required: ['date', 'start_time', 'end_time', 'activity'],
  },
  handler: async (params) => {
    // 1. 解析时间
    // 2. 名称 → ID 映射（category name → categoryId, goal name → goalId）
    // 3. 调用 dataService.entries.add()
    // 4. entryStore.loadEntries()
    // 5. autoPush()
    // 6. 返回 ActionResult
  },
  confirm: async (params) => {
    // 生成确认卡片，显示要创建的记录预览
  },
}
```

### 7.2 `update_entry`

```typescript
{
  name: 'update_entry',
  description: '修改一条已有时间记录。可修改活动名、分类、目标、开始/结束时间。需要先通过查询确定记录 ID。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      entry_id: { type: 'string', description: '记录 ID' },
      activity: { type: 'string', description: '新的活动描述' },
      category: { type: 'string', description: '新的类别名称' },
      goal: { type: 'string', description: '新的目标名称' },
      start_time: { type: 'string', description: '新的开始时间，HH:mm' },
      end_time: { type: 'string', description: '新的结束时间，HH:mm' },
    },
    required: ['entry_id'],
  },
  // handler: 查找 entry → 构造 updates → dataService.entries.update()
  // confirm: 显示 before/after 对比
}
```

### 7.3 `delete_entry`

```typescript
{
  name: 'delete_entry',
  description: '删除一条时间记录（软删除）。需要先通过查询确定记录 ID。',
  category: 'write',
  risk: 'high',
  parameters: {
    type: 'object',
    properties: {
      entry_id: { type: 'string', description: '要删除的记录 ID' },
    },
    required: ['entry_id'],
  },
  // handler: dataService.entries.delete(id)
  // confirm: 显示要删除的记录内容，红色高亮
}
```

### 7.4 `merge_entries`

```typescript
{
  name: 'merge_entries',
  description: '合并多条时间记录为一条。使用最早的开始时间和最晚的结束时间，活动名可指定或自动组合。',
  category: 'write',
  risk: 'high',
  parameters: {
    type: 'object',
    properties: {
      entry_ids: {
        type: 'array',
        items: { type: 'string' },
        description: '要合并的记录 ID 列表（至少 2 条）',
      },
      activity: { type: 'string', description: '合并后的活动名（可选，默认取第一条）' },
      category: { type: 'string', description: '合并后的类别（可选，默认取第一条）' },
      goal: { type: 'string', description: '合并后的目标（可选，默认取第一条）' },
    },
    required: ['entry_ids'],
  },
  // handler: 查找所有 entries → 计算合并后的时间范围 → 创建新记录 → 软删除旧记录
  // confirm: 列出所有要合并的记录 + 合并结果预览
}
```

### 7.5 `split_entry`

```typescript
{
  name: 'split_entry',
  description: '将一条时间记录按指定时间点拆分为两条。',
  category: 'write',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      entry_id: { type: 'string', description: '要拆分的记录 ID' },
      split_time: { type: 'string', description: '拆分时间点，HH:mm' },
      first_activity: { type: 'string', description: '前半段活动名（可选，默认保持原名）' },
      second_activity: { type: 'string', description: '后半段活动名（可选，默认保持原名）' },
    },
    required: ['entry_id', 'split_time'],
  },
  // handler: 修改原记录 endTime → 创建新记录从 splitTime 到原 endTime
  // confirm: 显示拆分前后对比
}
```

### 7.6 `add_goal` / `update_goal` / `delete_goal`

目标操作与时间记录类似，参数更简单：

- `add_goal`: `{ date, name, color? }` → `dataService.goals.add()`
- `update_goal`: `{ goal_id, name?, color? }` → `dataService.goals.update()`
- `delete_goal`: `{ goal_id }` → `dataService.goals.delete()`

### 7.7 维护 Actions

**`find_overlaps`** / **`find_gaps`** / **`find_anomalies`**：

只读诊断，直接调用 `dataService.entries.findOverlaps()` / `findGaps()` / `findAnomalies()`，将结果格式化为自然语言返回。AI 可以基于诊断结果建议修复操作。

**`auto_categorize`**：

```typescript
{
  name: 'auto_categorize',
  description: '自动为缺失分类的记录推断并补全分类。基于活动名称与历史分类模式匹配。',
  category: 'maintenance',
  risk: 'low',
  parameters: {
    type: 'object',
    properties: {
      date: { type: 'string', description: '可选，仅处理指定日期，YYYY-MM-DD' },
    },
  },
  handler: async (params) => {
    // 1. 查找无分类记录
    // 2. 查找历史同名活动的分类（精确匹配活动名）
    // 3. 频率最高的分类作为推断结果
    // 4. 无历史匹配的记录跳过，不强制分类
    // 5. 批量更新（每条仍走 dataService 单独更新以保持 sync）
    // 6. 返回处理结果汇总（包含成功归类数 + 无法推断数）
  },
  confirm: async (params) => {
    // 列出每条记录的推断分类，让用户确认
  },
}
```

**`batch_update`**：

```typescript
{
  name: 'batch_update',
  description: '批量修改记录的分类或目标。可按日期范围、当前分类、活动关键词筛选要修改的记录。',
  category: 'maintenance',
  risk: 'high',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: '起始日期' },
      end_date: { type: 'string', description: '结束日期' },
      filter_category: { type: 'string', description: '可选，只修改此分类的记录' },
      filter_activity: { type: 'string', description: '可选，活动名包含此关键词' },
      new_category: { type: 'string', description: '可选，设置新分类' },
      new_goal: { type: 'string', description: '可选，设置新目标' },
    },
    required: ['start_date', 'end_date'],
  },
  // handler: 筛选 → 逐条更新 → 返回汇总
  // confirm: 列出所有匹配的记录和变更内容
}
```

---

## 8. 从现有代码迁移

### 8.1 迁移步骤

1. 创建 `src/services/actions/` 目录结构
2. 定义类型 (`types.ts`) 和 registry (`registry.ts`)
3. 将现有 3 个只读工具从 `toolDefinitions.ts` 迁移到 `actions/read/` 下
    - 执行逻辑完全不变，只是换了注册方式
4. `toolDefinitions.ts` 保留但标记 deprecated，内部改为从 registry 获取
5. 改造 `toolCallEngine.ts`：
    - 工具声明：`actionRegistry.toToolDefinitions()`
    - 执行路由：`actionRegistry.get(name).handler(args)`
    - 新增确认中断逻辑
6. 逐步添加写入和维护 actions
7. 改造 AI Chat UI，添加确认卡片

### 8.2 兼容性保证

- 迁移后，现有 3 个只读查询的行为**完全一致**——输入输出格式不变
- 旧的 `toolDefinitions.ts` 最终可删除，但迁移期可共存
- `toolCallEngine.ts` 的 `onPhase`/`onChunk`/`onThinking`/`onToolCall` callbacks 保持不变

---

## 9. query_time_entries 增强：返回 entry ID

当前 `query_time_entries` 返回的是格式化文本表格，不包含 entry ID。这对于只读查询足够了，但写入操作需要 ID 来定位记录。

### 改造方案

在返回的详细记录中**追加 ID 列**：

```
### 详细记录
ID | 日期时间 | 活动 | 类别 | 目标 | 时长
abc123 | 04-02 14:00~15:30 | 学习数学 | 学习 | 期末复习 | 1小时30分钟
```

AI 通过查询获得 ID 后，即可在后续 `update_entry` / `delete_entry` / `merge_entries` 中引用。

为避免 ID 过长占用 token，使用 ID 的前 8 位作为短 ID，handler 中通过前缀匹配查找完整 ID。

---

## 10. 为外部 Agent 预留的接口

当前不实现，但 registry 设计天然支持：

### 未来 MCP Adapter（示例）

```typescript
// 未来：src/services/mcp/adapter.ts
import { actionRegistry } from '../actions/registry';

function registerMCPTools(server: MCPServer) {
  for (const action of actionRegistry.getAll()) {
    server.registerTool({
      name: action.name,
      description: action.description,
      inputSchema: action.parameters,
      handler: async (params) => {
        // MCP 场景下可能需要不同的确认机制
        const result = await action.handler(params);
        return result.message;
      },
    });
  }
}
```

### 未来 REST API Adapter（示例）

```typescript
// 未来：Electron main process 或本地 HTTP server
app.post('/api/actions/:name', async (req, res) => {
  const action = actionRegistry.get(req.params.name);
  if (!action) return res.status(404).json({ error: 'Action not found' });
  const result = await action.handler(req.body);
  res.json(result);
});
```

**关键点**：这些 adapter 只需要读 registry，不需要知道 handler 内部实现。这就是 Action Registry 模式的核心价值——一次定义，多处消费。

---

## 11. 实施阶段

### Phase 1: 基础架构（Action Registry + 迁移只读工具）
- 创建 `src/services/actions/` 类型、registry、index
- 迁移 3 个现有只读 action
- 改造 `toolCallEngine` 从 registry 获取工具
- **验证点**：现有 AI 对话功能一切正常，输出完全一致

### Phase 2: 确认机制 + 基础写入
- 在 `toolCallEngine` 中实现确认中断逻辑
- 在 AI Chat UI 中添加确认卡片组件
- 实现 `add_entry`、`update_entry`、`delete_entry`
- 增强 `query_time_entries` 返回 entry ID
- 升级系统提示词
- **验证点**：可以通过对话新增/修改/删除记录，确认流程正常

### Phase 3: 高级写入 + 目标管理
- 实现 `merge_entries`、`split_entry`
- 实现 `add_goal`、`update_goal`、`delete_goal`
- **验证点**：合并/拆分记录正确，目标管理正常

### Phase 4: 数据维护
- 实现 `find_overlaps`、`find_gaps`、`find_anomalies`
- 实现 `auto_categorize`、`batch_update`
- **验证点**：数据诊断准确，自动分类合理

---

## 12. 不做什么

- **不做外部 Agent 接入**——architecture 预留但不实现 MCP/REST adapter
- **不做后台自动化**——没有定时任务、没有 Observer、没有主动推送
- **不做跨会话记忆**——AI 不记住用户偏好（每次对话从头开始，依靠工具查询）
- **不做移动端 AI UI**——先桌面端，后续扩展
- **不改数据模型**——不新增表、不修改 schema
- **不做权限系统**——单人使用，不需要 ACL
