# AI 助手

AI 助手是**仅桌面端**的功能，通过自然语言查询本地时间数据。

## 配置

通过 `.env` 文件或应用内设置（ExportPage → AI 设置）配置：

```env
VITE_AI_PROVIDER=qwen
VITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_AI_API_KEY=sk-...
VITE_AI_MODEL=qwen3.5-plus
```

所有 Provider 均使用 OpenAI 兼容的 `/v1/chat/completions` 协议。

## 支持的 LLM Provider

| Provider | 内置模型 |
|---|---|
| 阿里云 Qwen | qwen3.5-plus, qwen3-max-preview |
| Google Gemini | gemini-3-flash-preview, gemini-3.1-pro-preview |
| 智谱 GLM | glm-4-flash, glm-4-plus, glm-4-long |
| Kimi | moonshot-v1-auto, moonshot-v1-128k |
| MiniMax | MiniMax-Text-01, abab6.5s-chat |
| OpenAI | gpt-4o, gpt-4o-mini, o4-mini |
| Custom | 用户自定义 baseURL |

每个 Provider 的配置独立存储，切换 Provider 不会丢失其他 Provider 的设置。配置持久化在 `localStorage`。

## Tool Calling 系统

AI 通过 Function Calling 查询本地 IndexedDB 数据，不上传任何数据到 LLM。

### 三个内置工具

**`query_time_entries`**
```
参数：start_date, end_date, category, goal（均可选）
返回：统计摘要（总时长、按分类/目标分布）+ 最多 200 条详细记录
底层：dataService.entries.query()
```

**`list_categories`**
```
参数：无
返回：全部分类列表（id + 名称）
底层：dataService.categories.list()
```

**`list_goals`**
```
参数：start_date, end_date（可选）
返回：指定时间范围内的目标列表
底层：dataService.goals.query()
```

### 调用引擎（toolCallEngine.ts）

最多执行 5 轮循环，每轮有以下 Phase 状态：

```
[preparing]  →  构建 system prompt（注入当前日期、分类列表、使用说明）
[thinking]   →  调用 LLM，检查响应类型：
                 ├─ 包含 tool_calls → 执行工具 → 把结果追加到消息 → 下一轮
                 ├─ 包含文本内容   → 直接返回，跳过 [answering]
                 └─ 错误           → 进入 [answering] fallback
[toolCall]   →  本地执行查询（IndexedDB），返回 JSON 字符串
[answering]  →  流式输出最终回答（仅在 [thinking] 未产生文本时触发）
```

### 添加新工具

> **注意：** `feat/ai` 分支引入了 Action Registry 架构，取代了下面描述的手动方式。详见 [Action Registry 文档](action-registry.md)。

**(旧方式 — main 分支)** 在 `src/services/ai/toolDefinitions.ts` 中：

1. 在 `toolDefinitions` 数组中添加工具描述（JSON Schema 格式）
2. 在 `executeToolCall(name, args)` 的 switch 中添加对应处理逻辑，调用 `dataService` 获取数据并格式化为字符串

**(新方式 — feat/ai 分支)** 通过 Action Registry：

1. 在 `src/services/actions/` 对应分类目录下创建 action 文件
2. 在 `src/services/actions/index.ts` 中注册
3. toolCallEngine 自动发现并生成 AI tool definition

## 消息格式（aiStore）

每条消息除了 `role` / `content` 外，还携带调试元数据：

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
  phases?: Phase[];       // 处理阶段记录
  thinking?: string;      // 模型的推理过程（部分模型支持）
  loading?: boolean;      // 是否正在生成
  error?: string;         // 错误信息
  debugInfo?: any;        // 原始 LLM 响应（调试用）
}
```

对话历史存储在 `aiStore.messages`，持久化到 `localStorage`，刷新页面后保留。
