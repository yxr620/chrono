# 智能预选（metadataPredictor）

`src/services/metadataPredictor.ts` 负责在录入活动时，根据本地历史记录预测类别和目标。它不调用网络，不依赖 LLM，主要服务于两个入口：

| 入口 | 调用位置 | 行为 |
|---|---|---|
| 主表单 | `src/components/TimeTracker/TimeEntryForm.tsx` | 用户输入活动名后，以 300ms 防抖调用 `predictMetadata(activity, currentGoals)`，只自动落地高置信度类别/目标 |
| Quick Capture | `src/services/quickCapture/quickCaptureParse.ts` | LLM 解析出待确认条目后，再用本地历史预测补全 category / goal；只有高置信度本地结果会覆盖 AI 字段 |

这个模块的定位是“减少重复选择”，不是强分类器。实现策略是：保留大部分有用的历史复用能力，但把短输入、过期异步结果、模糊间接匹配和低置信度结果挡在自动写入之外。

当前实现采用“保留路径 A + 加护栏”的策略：历史活动到历史目标名再映射到今日目标仍然是主要能力，但只有 `exact` / `strong` 活动匹配可以进入路径 A，单字或弱短输入不会产生自动目标。`PredictionResult.categoryId` / `goalId` 仅代表 high-confidence 可落地结果；中/低置信度只保留在结构化字段中，供诊断或未来 UI 建议使用。

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

因此单个中文字符（例如“上”）和偶然的短英文子串（例如 `ai` 命中 `email`）不会产生高置信度自动选择。

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

`categoryId` / `goalId` 只在对应结构化字段为 `confidence === 'high'` 时填充。调用方如果要自动写入表单或覆盖 AI 字段，应优先使用这个 high-only 语义，不能把 `medium` 当作可自动落地结果。

## 类别预测

类别预测按活动匹配等级处理：

1. `exact`：规范化后的活动名完全相同，且输入包含有效片段。若类别频率最高项唯一，返回 high；若最高项打平，返回 medium 且不填充 legacy `categoryId`。
2. `strong`：活动名之间存在显著片段重叠。若最高项唯一，返回 high；若打平，返回 medium。
3. `weak` / `none`：不自动落地。

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

- 高置信度 legacy `categoryId` / `goalId` 可以自动写入。
- 中/低置信度不会写入 `selectedCategoryId` / `selectedGoalId`，当前也不显示建议。
- 表单记录 `autoFilledCategoryIdRef` / `autoFilledGoalIdRef`，因此当后续预测为空或降级时，只会清空仍然来自自动填充的值。
- 用户手动选择过类别或目标后，预测不会覆盖对应字段，也不会清空用户选择。
- `predictionSeqRef` 用于代际校验：旧输入的异步预测晚返回时会被丢弃。
- activity 清空时会清理 stale auto-filled 值，同时保留手动选择。

当前没有专门实现“输入法合成期间暂停预测”。短输入护栏、代际校验和过期自动填充清理已经覆盖了原先最容易出错的合成中间态。

## Quick Capture 覆盖策略

Quick Capture 会先让 AI 解析用户口述，再用本地 `predictMetadata()` 做补全。当前策略是：

- 只有 `local.category.confidence === 'high' && local.category.id` 时，才覆盖 AI 给出的 category。
- 只有 `local.goal.confidence === 'high' && local.goal.id` 时，才覆盖 AI 给出的 goal。
- 中/低置信度或无命中的本地预测不覆盖用户口述解析结果。

这保留了“历史非常稳定时自动补全”的价值，同时避免弱模糊命中把 AI 从上下文里推断出的字段覆盖掉。

## 仍未做的优化

当前暂不包含这些项：

- 保留用户纠错信号：需要持久化用户纠错记忆和同步策略，暂不引入。
- 对重复目标名做额外保护：当前通过打平降级覆盖主要风险，暂不做额外规则。
- 时间段语境：暂不加入 hour bucket。
- 更复杂的缓存失效：当前依赖 1 分钟 TTL 和局部主动失效，后续可以接入统一写入层。

## 回归测试入口

这些测试覆盖短输入误选、路径 A 降级、直接目标打平、过期自动填充清理、表单代际校验和 Quick Capture 高置信度覆盖 guard。

- `node --import tsx --test tests/metadata-predictor.test.ts`
- `node --import tsx --test tests/metadata-prediction-form-state.test.ts`
- `node --import tsx --test tests/time-entry-form.metadata-prediction.test.ts`
- `node --import tsx --test tests/quick-capture-metadata-enrichment.test.ts`
- `npm run test:app-checks`
