# AI 助手对话流程

AI 助手是 Chrono 的桌面端自然语言入口。它不是一个单纯的聊天框，而是一个「对话 UI + tool calling 引擎 + 本地数据工具 + 可选写入确认」组成的流程系统。

理解它时，先抓住一句话：**`toolCallEngine` 用 Vercel AI SDK 的 `streamText` 跟模型保持一条流式连接，SDK 在流里替我们处理工具循环；引擎把 `fullStream` 的事件翻译成阶段、文字增量、思考过程和工具调用展示；写入操作必须经过用户确认。**

> 自 2026-05-16 起，AI 客户端层从手撸 SSE 切换到了 **Vercel AI SDK** (`ai@5.x` + `@ai-sdk/openai-compatible`)。文字与 tool_call 在同一条流里出现，工具执行完后无缝继续 stream（不再有"非流式 thinking → 流式 answering"的二段式）。详见 `docs/superpowers/specs/2026-05-16-streaming-ai-assistant-design.md`。

## 总览图

![AI 助手对话执行流程](assets/ai-assistant-flow.png)

## 用户实际看到的流程

一次提问在页面上会表现为下面几件事：

1. 用户消息立即出现在右侧气泡。
2. 系统创建一个空的 assistant 气泡，并开始显示阶段列表。
3. 阶段列表通常从 `准备上下文` 到 `思考中`，如果需要数据，会出现 `查询数据`；每个阶段旁会显示耗时。
4. 如果模型输出 `<think>`，页面会把它放进「思考过程」折叠区。
5. 如果模型需要修改数据，页面会额外出现确认卡片；用户确认前，工具不会真正执行写入。
6. 最终回答会流式进入 assistant 气泡；完成后可以点「复制全部」复制阶段、思考和回答。
7. 用户点「停止生成」时，当前网络请求会 abort；如果此时正在等确认，会先按取消处理，避免对话卡住。

这个页面本身就是最重要的人测接口：阶段名告诉你当前卡在哪一层，耗时告诉你慢在哪一层，折叠的 debugInfo 会按结构展示 system prompt、模型请求 messages、tools 声明、模型响应和工具结果。

## 主要模块

| 模块 | 位置 | 职责 |
|---|---|---|
| 对话页面 | `src/components/AIAssistant/AIAssistant.tsx` | 输入、消息气泡、阶段展示、停止生成、确认卡片 |
| 对话状态 | `src/stores/aiStore.ts` | provider 配置、消息列表、每条消息的 phases / thinking / loading / 结构化 debugInfo |
| 调用引擎 | `src/services/ai/toolCallEngine.ts` | 构建 prompt、组织历史、订阅 SDK `fullStream` 并把事件翻译成阶段 / 文字增量 / 工具调用 |
| LLM 客户端 | `src/services/ai/llmClient.ts` | 基于 `@ai-sdk/openai-compatible` 构造 `LanguageModel`；导出 `streamChatWithTools`、`generateChatOnce` 两个统一入口 |
| Gateway | `src/services/gateway/` | 根据 feature mode 选择 BYO 或 Managed AI 配置 |
| Action Registry | `src/services/actions/` | 注册本地工具，提供 tool schema，执行 read/write/maintenance action |

## 执行主线

### 1. UI 收到输入

`AIAssistant` 做三件事：

- 从 `aiStore.messages` 取最近 6 条有效历史，构造给模型的上下文。
- 追加一条 user message，再追加一条 loading 状态的 assistant placeholder。
- 创建 `AbortController`，调用 `runToolCallLoop()`。

历史只取用户消息和已经完成的 assistant 文本回答；loading、error、空内容不会进入下一轮模型上下文。

### 2. preparing：构建本轮上下文

`toolCallEngine` 先取 AI client config：

- BYO：从 `aiStore.config` 读取用户自己的 `baseURL / apiKey / model`。
- Managed：从 Chrono 后端地址拼出 `<VITE_AUTH_API_URL>/v1`，用登录 JWT 作为 Bearer token。

然后它构建 system prompt。这个 prompt 不直接塞入全部时间数据，只包含：当前日期、当前分类列表、工具使用规则、回答规则、写操作规则。真实时间记录只在模型明确调用工具后才从本地 IndexedDB 查询。

### 3. thinking：开启流式

引擎调用 `streamChatWithTools({ model, messages, tools, maxSteps: 5, abortSignal })`，订阅 SDK 返回的 `result.fullStream` —— 一个 `AsyncIterable<...>`，按时间顺序产出各种事件。引擎不再自己跑 round 循环：SDK 内部根据 `stopWhen: stepCountIs(5)` 自动处理「调模型 → 看到 tool_call → 执行 execute → 再调模型」的多轮逻辑。

引擎要做的只是把事件翻译成 UI 动作。映射表：

| SDK 事件 | 引擎动作 | 用户看到 |
|---|---|---|
| `text-delta` (工具前) | 累加文字到 `thinking` 阶段；`onChunk(delta)` 写入 assistant 气泡 | 文字一字一字流出 |
| `reasoning-delta` | `onThinking(delta)`，写入「思考过程」折叠区 | 推理模型 (R1/QwQ) 的内心独白逐字增长 |
| `tool-call` | finalize 当前阶段，push 一个新的 `toolCall` 阶段，标签写工具名 + 参数摘要 | 出现 `查询记录 (2026-05-15 ~ 2026-05-16)` 之类的行 |
| `tool-result` | 给当前 `toolCall` 阶段附结构化 debugInfo | 阶段折叠展开能看到执行结果 |
| `text-delta` (工具后) | push `answering` 阶段，继续累加文字 | 工具结果之后无缝接上最终回答 |
| `finish` | 结束本轮 | 阶段列表最后一项的耗时定格 |
| `error` | 抛错；catch 里如果是 unsupported-tools 错误，转成「请切换支持 function calling 的模型」 | assistant 气泡显示 `❌` 错误文本 |

### 4. toolCall：执行本地工具

`actionRegistry.toSdkTools(ctx)` 把所有注册过的 action 翻译成 SDK 的 `Tool` 字典。每个 `Tool` 的 `execute(args)` 函数就是 action.handler 的包装：

- `risk: 'none'`（读取/诊断）：直接 `await action.handler(args)` 并返回结果给 SDK
- `risk: 'low' | 'high'`（写入/维护）：先 `await ctx.onConfirmRequired(card)`；用户点取消则返回 `{ success: false, message: '用户取消了此操作。' }`，SDK 会把这个结构 JSON 化作为 tool result 喂回模型，模型决定怎么继续
- 调用方没有提供 `onConfirmRequired`：高风险 action 被拒绝，返回 `{ success: false, message: '...调用方未提供用户确认机制...' }`，绝不静默写入

确认流程是 Action Registry 的核心安全边界，详见 [Action Registry 文档：确认流程](action-registry.md#确认流程)。

SDK 串行执行 `execute`，所以多 tool 在同一轮被调时会按 index 顺序逐个走完。这一行为对 confirmation UI 友好（一次只弹一张卡）。

### 5. answering：工具后的最终回答

工具结果回到模型，模型继续输出 —— SDK 把那一段输出当作新一批 `text-delta` 事件发出，引擎在收到工具后的第一个 `text-delta` 时 push `answering` 阶段，开始累加文字。

阶段顺序通常是：

- 简单问题：`准备上下文 -> 思考中 -> (流式文字)` ← 没有 `生成回答` 阶段，模型在 thinking 直接流出来
- 查询数据：`准备上下文 -> 思考中 -> 查询数据 -> 生成回答 -> (流式文字)`
- provider 不支持 tools：`准备上下文 -> 思考中 -> ❌ 当前模型不支持工具调用，请切换…`（不再静默走无工具兜底，而是显式提示）
- 写入操作：`准备上下文 -> 思考中 -> 查询数据 -> 确认卡片 -> 生成回答 -> (流式文字)`

> **二段式废除**：旧实现里 `thinking` 是非流式调用、`answering` 才流式。现在每个阶段内部都是 SDK 事件驱动的真流式，文字与 tool_call 在同一条流里交错。

## 典型步骤图：读取型问题

总览图解释的是所有条件分支。下面这张图只看一条最常见的顺序路径：用户问「昨天做了什么」，AI 需要读取本地时间记录，然后基于工具结果回答。

![AI 助手读取型请求分步骤流程](assets/ai-assistant-step-flow.png)

这条路径的关键点是：`thinking` 阶段就开始 streaming，模型可能先吐一句话再发 `tool-call` 事件；`toolCall` 阶段执行本地查询并把结构化结果交回 SDK；SDK 自动继续流，引擎在下一个 `text-delta` 时 push `answering` 阶段。写入型请求会在 `toolCall` 中插入确认卡片，确认细节放在 [Action Registry 文档：确认流程](action-registry.md#确认流程)。

> 流程图的 PNG 还反映的是 2026-05-16 之前的「非流式 thinking + 流式 answering」结构。文字描述以这份 Markdown 为准。



## 分支细节

### 直接回答

适用于闲聊、解释性问题，或者模型认为不需要本地数据的问题。风险是：如果用户问的是时间记录，而模型没有调用工具，答案可能缺少数据依据。调试时看 `thinking` 阶段的 debugInfo，确认发给模型的 messages、tools 数量，以及 prompt 是否明确要求查询。SDK 把请求详情写入 `result.request` / `result.response`，引擎把这些封装为 `createTextDebug` 给 UI 折叠展示。

### 读取型查询

典型问题是「昨天做了什么」「本周花了多少时间在项目 X」。模型应调用 `query_time_entries`、`list_goals`、`list_categories` 或 `search_memos`。工具结果只留在本地消息链路里，用于下一轮模型综合回答。

### 写入或维护

典型问题是「帮我新增一条记录」「删除刚才那条」「整理今天重叠的记录」。模型会先尽量查询对象，再调用写入/维护 action。真正修改前会弹确认卡片；用户取消时，取消结果也会回到模型，让最终回答能说明没有执行。

### 错误和取消

- 网络/API 错误：assistant 气泡显示错误文本，并标记 `error`。
- 用户停止：AbortController 中断请求；如果正在等待确认，会先 resolve(false)。
- action handler 抛错：引擎把异常包装为失败的 tool result，让模型仍能给用户一个解释。

## 数据与隐私边界

AI 助手不会把整个 IndexedDB 上传给模型。默认发送给模型的是 prompt、最近对话历史、当前问题、tool schema。只有当模型调用某个 action 时，对应 action 的结果会作为 tool message 发回模型。因此，实际暴露的数据范围由 action handler 的返回文本决定。

## 调试与测试入口

人工测试优先看对话页面：阶段、耗时、折叠 debugInfo 和确认卡片就是最直接的反馈面。

机器/半自动测试入口：

- `npm run ai:debug`：CLI 版对话，可通过 `--data <file>` 加载导出的数据，在终端观察 phase、tool、最终回答。
- `npx eslint src/components/AIAssistant/AIAssistant.tsx src/stores/aiStore.ts`：改动对话 UI 或 store 后的最小 lint 检查。
- Action handler 适合用 `fake-indexeddb` 做单测；tool-calling 主循环适合通过 mock LLM 注入固定 `tool_calls` 做回归测试。

阶段耗时的定位方式：

| 慢的阶段 | 通常说明 |
|---|---|
| preparing | 本地 DB 类别读取或 gateway 配置获取慢 |
| thinking | 第一个 token 迟迟不出 → provider 首包延迟（TTFT）高，或网络慢 |
| toolCall | 本地 action、确认等待、DB 查询/写入慢 |
| answering | token 流出后变慢 → provider 解码慢，或 Managed 后端 FC 触发器仍是 buffer 模式（详见 `server/RUNBOOK.md` 的 streaming-relay 章节）|

## 配置速查

AI 有两种模式，模式存储在 `localStorage.chrono_feature_modes`。

| 模式 | 凭据来源 | 适用 |
|---|---|---|
| BYO | 用户在应用内或 `.env` 填入 LLM API Key | 自部署 / 不愿登录 |
| Managed | 登录 Chrono 后端，由后端代理 `/v1/chat/completions` | 需要 `VITE_AUTH_API_URL` 与白名单 |

BYO `.env` 示例：

```env
VITE_AI_PROVIDER_ID=qwen
VITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_AI_API_KEY=sk-...
VITE_AI_MODEL=qwen3.6-max-preview
```

Managed 只需要前端设置 `VITE_AUTH_API_URL=https://chrono-api.fcv3.<region>.fcapp.run`。后端配置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`、`ALLOWED_AI_EMAILS`，实现位于 `server/src/features/ai.ts`。

## Managed 模式的流式状态

代码层面，`server/src/features/ai.ts` 已经按 SSE pass-through 实现（返回 `{ __raw: true, stream: upstream.body }`，`server/src/index.ts` 通过 FC 3.0 stream response 对象逐 chunk 写回）。但**是否真流式还取决于 FC 函数触发器**：

- FC 触发器 = **HTTP 流式响应**（FC 3.0 默认）：Managed 用户看到的体验和 BYO 一致，文字一字一字流出 ✓
- FC 触发器 = **HTTP 请求-响应**（FC 2.x 老配置）：后端代码无法逐 chunk 输出，整段返回；Managed 用户看起来仍是「整段一次 push」的伪流式 —— **功能可用，但体验退化**

排查参考 `server/RUNBOOK.md` 的 *Streaming relay (since 2026-05-16)* 章节。无论触发器配置如何，前端代码路径完全一致；切换 BYO 模式可立刻拿到真流式。
