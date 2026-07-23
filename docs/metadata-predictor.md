# 智能预选（metadataPredictor）

`src/services/metadataPredictor.ts` 负责在录入活动时，根据本地历史记录预测类别和目标。它不调用网络，不依赖 LLM，主要服务于两个入口：

| 入口 | 调用位置 | 行为 |
|---|---|---|
| 主表单 | `src/components/TimeTracker/TimeEntryForm.tsx` | 用户输入活动名后，以 300ms 防抖调用 `predictMetadata(activity, currentGoals)`；Category 必选时采用最佳候选，Goal 仍只采用高置信度结果 |
| Quick Capture | `src/services/quickCapture/quickCaptureParse.ts` | LLM 解析出待确认条目后，用本地历史补全无效或缺失的 Category；有效 AI Category 会保留，Goal 仍只采用高置信度本地结果 |

这个模块仍以本地历史复用为主。Category 同时提供两种消费语义：结构化 `category.id` 是确定性的最佳候选，按 `exact → strong 历史分类投票 → 最近 60 天全局频率 → Category order` 选择；兼容字段 `categoryId` 仍只代表 high-confidence 结果。Goal 继续保持 high-confidence-only 自动落地策略。

`strong` 表示新活动和历史活动至少共享一个有效活动片段。Category 路径只统计这些历史活动已经关联的 Category，不读取 Goal 名称；Goal 路径虽然复用 activity match 分组，但随后独立处理历史 Goal 名称、页面 Goal 和直接 Goal token。

## 当前数据流

### 缓存构建

`predictMetadata()` 首次调用时会通过 `ensureCache()` 从 IndexedDB 读取最近 60 天的历史：

- `entries`：通过 `endTime` 索引限制时间窗口，只使用 `!deleted && endTime !== null` 的已完成记录。
- `goals`：只使用未删除且非 `check` 类型的目标，构建 `goalId -> goalName` 映射。
- `categories`：只使用未删除类别；历史 entry 引用已删除或不存在类别时不会进入类别频率表。
- 缓存 TTL 为 1 分钟；`invalidatePredictionCache()` 用于主动失效。

缓存中按规范化后的活动名聚合：

- `categoryFreq`：`activity -> categoryId -> count`
- `goalNameFreq`：`activity -> historicalGoalName -> count`

### 文本规范化

预测前会统一做保守 normalize：

- NFKC 规范化。
- 英文转小写。
- 空白、标点、符号折叠成空格。
- 英文/数字 token 至少长度为 2 才算有效片段。
- 中文 token 至少两个字才算有效片段，并额外生成相邻 bigram。

因此单个中文字符（例如“上”）和偶然的短英文子串（例如 `ai` 命中 `email`）不会通过片段匹配产生高置信度自动选择。类别预测额外支持完整活动名 exact lookup：例如历史里完整记录过“看B站”并稳定归为“娱乐”，再次输入“看B站”可以自动选中该类别；这个规则不放宽目标预测。

## 返回结构

`PredictionResult` 同时包含结构化字段和兼容旧调用方的 legacy 字段：

```ts
interface PredictionResult {
  category: MetadataPredictionField;
  goal: MetadataPredictionField;
  categoryId: string | null;
  goalId: string | null;
}
```

`categoryId` / `goalId` 只在对应结构化字段为 `confidence === 'high'` 时填充。Category 必选的调用方使用结构化 `category.id`；Category 可选的调用方和所有 Goal 调用方继续使用 high-only 的 legacy 字段。

## 类别预测

类别预测依次处理：

1. 完整活动名 exact lookup：先用规范化后的活动名直接查历史缓存。只要输入不是单字符，且类别频率最高项唯一，就返回 high；若最高项打平，仍返回一个确定的结构化候选，但降为 medium 且不填充 legacy `categoryId`。这个路径不依赖有效片段，因此能覆盖“看B站”这类中英混排短活动。
2. strong 历史分类投票：新活动与历史活动存在有效活动片段重叠时，汇总这些历史活动已经关联的 Category 频率。最高项唯一返回 high；打平时按全局 60 天频率、Category order、Category id 确定候选并返回 medium。
3. 全局 60 天兜底：没有 exact 或 strong 分类候选时，选择最近 60 天使用次数最多的有效 Category，返回 low。
4. 冷启动兜底：没有分类历史时，按 Category order、Category id 选择第一项，返回 low。

类别频率只统计缓存构建时仍然有效的类别，避免历史孤儿 `categoryId` 或已删除类别被写回新记录。缓存有效期内的类别变更依赖 TTL 或主动失效生效。

## 目标预测

目标预测只考虑调用方传入的页面日期 / 选中日期 time 型目标，并再次排除删除目标和 `check` 类型目标。

### 路径 A：历史活动 -> 历史目标名 -> 页面目标

路径 A 被保留，因为它是当前体验里最有价值的部分：用户经常会用相同或相近活动名复用历史目标。

护栏如下：

- 只有 `exact` / `strong` 活动匹配能进入路径 A。
- `weak` 活动匹配不会自动选中目标。
- 历史目标名与页面目标名精确匹配时，可以 high，但必须不打平。
- 历史目标名与页面目标名只是片段相似时，会按历史频率、匹配强度和片段分数一起排序；打平时返回 medium 且不填充 legacy `goalId`。
- `strong` 活动匹配 + 模糊目标名映射不会 high 自动落地。
- 历史精确目标名打平、直接目标片段打平、单字短输入都会被降级，不会自动选中。

### 路径 B：直接目标片段匹配

当路径 A 没有任何候选结果时，会用输入活动和页面目标名做直接片段匹配。注意：如果路径 A 返回 medium 这类不可自动落地但有诊断意义的结果，当前不会继续回退到路径 B。

- 中文使用有效词段和相邻 bigram，例如“论文”可以命中“读论文”。
- 英文/数字 project token（例如 `COMP8015`）可以直接命中目标名。
- 只有最高分唯一时才返回 high；分数打平时返回 medium 且不填充 legacy `goalId`。

## 表单侧交互

主表单通过 `src/services/metadataPredictionFormState.ts` 统一处理预测结果落地：

- Category 必选时采用结构化 `category.id`；可选时只采用高置信度 legacy `categoryId`。
- Goal 始终只采用高置信度 legacy `goalId`。
- 表单记录 `autoFilledCategoryIdRef` / `autoFilledGoalIdRef`，因此当后续预测为空或降级时，只会清空仍然来自自动填充的值。
- 用户手动选择过类别或目标后，预测不会覆盖对应字段，也不会清空用户选择。
- `predictionSeqRef` 用于代际校验：旧输入的异步预测晚返回时会被丢弃。
- activity 清空时会清理 stale auto-filled 值，同时保留手动选择。

当前没有专门实现“输入法合成期间暂停预测”。短输入护栏、代际校验和过期自动填充清理已经覆盖了原先最容易出错的合成中间态。

## Category 必选设置

设置页的“每条记录自动关联 Category”默认开启并仅保存在当前设备。

- 开启：主表单采用结构化 `category.id`，Quick Capture 和 AI 助手在没有有效显式 Category 时也采用最佳候选；`dataService.entries.add/update` 在本地写入前执行最终校验。
- 关闭：调用方只采用 high-confidence `categoryId`，保存层允许 `null`。
- 没有 exact 或 strong 候选时，使用最近 60 天最常用的有效 Category；没有分类历史时使用 Category order 第一项。
- 没有任何有效 Category 时，本地新建或编辑会返回“请先创建至少一个 Category”。
- 同步和备份恢复绕过该本地偏好，不会改写原始数据。

## Quick Capture 覆盖策略

Quick Capture 会先让 AI 解析用户口述，再用本地 `predictMetadata()` 做补全。当前策略是：

- AI 已解析出的有效 Category 会保留。
- AI Category 缺失或无效时，必选模式采用结构化 `category.id`，可选模式只采用 high-confidence `categoryId`。
- 只有 `local.goal.confidence === 'high' && local.goal.id` 时，才覆盖 AI 给出的 goal。

AI Assistant 的 `add_entry` 确认卡和最终 handler 共用 Category 解析流程，因此预览会显示最终实际写入的 Category。

## 仍未做的优化

当前暂不包含这些项：

- 保留用户纠错信号：需要持久化用户纠错记忆和同步策略，暂不引入。
- 对重复目标名做额外保护：当前通过打平降级覆盖主要风险，暂不做额外规则。
- 时间段语境：暂不加入 hour bucket。
- 更复杂的缓存失效：当前依赖 1 分钟 TTL 和局部主动失效，后续可以接入统一写入层。
- 最近测试发现一个bug，貌似中英混搭的情况会无法关联到目标。 

## 回归测试入口

这些测试覆盖 Category 的 exact、strong、全局 60 天和冷启动选择，设置持久化，保存边界，表单交互，Quick Capture 以及 AI Assistant 确认预览。

- `node --import tsx --test tests/metadata-predictor.test.ts`
- `node --import tsx --test tests/category-assignment-preference.test.ts`
- `node --import tsx --test tests/entry-category-assignment.test.ts`
- `node --import tsx --test tests/add-entry-category-confirmation.test.ts`
- `node --import tsx --test tests/metadata-prediction-form-state.test.ts`
- `node --import tsx --test tests/time-entry-form.metadata-prediction.test.ts`
- `node --import tsx --test tests/quick-capture-metadata-enrichment.test.ts`
- `npm run test:app-checks`
