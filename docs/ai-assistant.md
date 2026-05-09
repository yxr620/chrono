# AI 助手

AI 助手是**仅桌面端**的功能，通过自然语言查询本地时间数据。

## 两种模式

在「服务」页选择：

| 模式 | 凭据来源 | 适用 |
|---|---|---|
| **BYO**（自带） | 用户在应用内填入 LLM API Key | 自部署 / 不愿登录 |
| **Managed**（托管） | 登录 Chrono 后端，由后端代理 `/v1/chat/completions` | 需要 `VITE_AUTH_API_URL` 与白名单 |

模式存在 `localStorage.chrono_feature_modes`。两种模式都走同一份 OpenAI 兼容协议，`toolCallEngine` / `chatStream` 对模式无感——这是 `gateway/managedGateway.ts` 把 `baseURL` 切到 `<FC>/v1` 并把 `apiKey` 换成 JWT 的结果。

## BYO 配置

通过 `.env` 文件或应用内设置（ExportPage → AI 设置 / 服务页）配置：

```env
VITE_AI_PROVIDER_ID=qwen
VITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_AI_API_KEY=sk-...
VITE_AI_MODEL=qwen3.6-max-preview
```

所有 Provider 均使用 OpenAI 兼容的 `/v1/chat/completions` 协议。阿里云百炼在北京地域的兼容入口是 `https://dashscope.aliyuncs.com/compatible-mode/v1`；新加坡或美国地域请改成对应的 regional endpoint。

## Managed 配置

只需要前端 `.env` 设置 `VITE_AUTH_API_URL=https://chrono-api.fcv3.<region>.fcapp.run`，剩下都在后端：

- FC 环境变量：`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`、`ALLOWED_AI_EMAILS`
- 用户在「服务」页选 Managed → 触发登录弹窗 → 后端检查 `/me/features.ai` 是否在白名单
- 后端默认采用**缓冲式中继**（buffer-then-relay）；如需真流式，参见 `docs/superpowers/archive/2026-05-01-managed-services-6-managed-ai.md` 的 Task 4

后端实现：`server/src/features/ai.ts`（路径 `POST /v1/chat/completions`）。运维操作：`server/RUNBOOK.md`。

## 支持的 LLM Provider

| Provider | 内置模型 |
|---|---|
| 阿里云百炼 Qwen | qwen3.6-max-preview, qwen3.6-plus, qwen3.6-flash |
| Google Gemini | gemini-3-flash-preview, gemini-3.1-pro-preview |
| 智谱 GLM | glm-4-flash, glm-4-plus, glm-4-long |
| Kimi | moonshot-v1-auto, moonshot-v1-128k |
| MiniMax | MiniMax-Text-01, abab6.5s-chat |
| OpenAI | gpt-4o, gpt-4o-mini, o4-mini |
| Custom | 用户自定义 baseURL |

每个 Provider 的配置独立存储，切换 Provider 不会丢失其他 Provider 的设置。配置持久化在 `localStorage`。

## Tool Calling 系统

AI 通过 Function Calling 查询并修改本地 IndexedDB 数据，不上传任何数据到 LLM。所有可调用工具由 **Action Registry**（`src/services/actions/`）统一注册，`toolCallEngine` 自动生成 OpenAI tool schema——参见 [Action Registry 文档](action-registry.md) 获取完整 action 列表（4 个 read / 8 个 write / 5 个 maintenance）。写入操作走「建议 → 用户确认 → 执行」流程。

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

通过 Action Registry：

1. 在 `src/services/actions/{read,write,maintenance}/` 对应目录下创建 action 文件
2. 在 `src/services/actions/index.ts` 中 `actionRegistry.register(...)`
3. toolCallEngine 自动发现并生成 AI tool definition

详见 [Action Registry 文档](action-registry.md)。

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
