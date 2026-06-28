# TimeEntryForm 自动时间选择机制

这篇文档解释主表单 `TimeEntryForm` 里「开始时间」和「结束时间」如何被自动设置。读这块代码时，先从本地 state 入手，再追 `setStartTime(...)` / `setEndTime(...)` 的写入点；store 和查询函数只是提供输入，不是最终状态来源。

## 读代码入口

主表单的时间来自组件本地 state：

```ts
const [startTime, setStartTime] = useState(new Date());
const [endTime, setEndTime] = useState<Date | null>(new Date());
```

这两个 state 同时决定 UI 显示和提交行为：

- `startTime`：当前表单显示和提交使用的开始时间。
- `endTime`：当前表单显示和提交使用的结束时间。
- `endTime === null`：表示这条表单将进入「开始计时」模式。
- `endTime !== null`：表示这条表单将进入「保存记录」模式。

`entryStore.nextStartTime` / `entryStore.nextEndTime` 不是长期业务状态，而是一次性的时间选择请求。例如记录列表点击一条完成记录，或时间轴点击一个空白 gap，外部组件会先把这次时间请求写到 store；`TimeEntryForm` 监听到请求后，调用 `setStartTime(...)` / `setEndTime(...)` 消费它，然后立刻清空。

## startTime 的写入点

真正改变「开始时间」的是 `setStartTime(...)`。这些是当前主要触发路径：

| 触发时机 | 写入值 | selectedDate 是否同步 |
|---------|--------|-----------------------|
| 组件挂载 | `getAutoStartTimeForDate(today)` | 不主动同步 |
| `selectedDate` 切换 | `getAutoStartTimeForDate(selectedDate)` | 已经由外部完成切日 |
| 列表点击已完成记录 | 该记录真实 `endTime`。列表先把时间请求写到 store，`TimeEntryForm` 监听后消费并清空 | 若日期不同则同步切日 |
| 时间轴点击已完成块 | 该记录真实 `endTime`。时间轴先把时间请求写到 store，`TimeEntryForm` 监听后消费并清空 | 若日期不同则同步切日 |
| 时间轴点击空白 gap | gap 的真实 `startTime`。时间轴先把 start/end 请求写到 store，`TimeEntryForm` 监听后同时设置 `startTime` / `endTime` 并清空 | 若日期不同则同步切日 |
| 点「上次结束」徽章 | 当前 `selectedDate` 的最后可见结束点 | 同步到该 Date 所在日期 |
| 点「现在」徽章 | `new Date()` | 同步到今天 |
| 点击开始计时 | `getAutoStartTimeForDate(selectedDate)`。表单会被清空并预置下一条默认开始时间；正在计时时普通表单暂时不显示 | 不主动同步 |
| 停止计时后 | 未跨日则 `getAutoStartTimeForDate(selectedDate)`；跨日则先切到停止日期，再由 `selectedDate` effect 重算 | 跨午夜时切到停止日期 |
| 保存手动记录后 | 未跨日则 `getAutoStartTimeForDate(selectedDate)`；跨日则先切到结束日期，再由 `selectedDate` effect 重算 | 跨午夜时切到结束日期 |
| `entries` 数据变化 | 如果当前 `startTime` 仍锚定旧的自动开始时间建议，跟随新的自动建议 | 不主动同步 |
| 用户手动选择开始时间 | 用户选中的真实 Date | 同步到该 Date 所在日期 |

这个模型的重点是：`TimeEntryForm` 没有一个集中式 reducer 管理时间状态，而是多个 UI / effect 触发点显式调用 `setStartTime(...)`。所以排查问题时，先 `rg "setStartTime\\(" src/components/TimeTracker/TimeEntryForm.tsx`，再判断是哪条路径触发。

## endTime 的写入点

`endTime` 比 `startTime` 少一层「自动衔接上一条」逻辑，但它决定表单是保存记录还是启动计时。

| 触发时机 | 写入值 | 行为含义 |
|---------|--------|----------|
| 组件初始 state | `new Date()` | 默认是「保存一条从 start 到 now 的记录」 |
| `selectedDate` 切换 | `null` | 切到另一天后默认进入「进行中 / 开始计时」语义 |
| 列表点击已完成记录 | `new Date()` | start 接在该记录后，end 回到当前时间 |
| 时间轴点击已完成块 | `new Date()` | start 接在该块后，end 回到当前时间 |
| 时间轴点击空白 gap | gap 的真实 `endTime` | 直接预填这个空白段，方便补录 |
| 点右侧「进行中」徽章 | `null` | 从手动保存切换为开始计时 |
| `endTime === null` 时点右侧「现在」 | `new Date()`，但必须大于 `startTime` | 从开始计时语义切回手动保存 |
| `resetForm()` | 今天则 `new Date()`；非今天则 `null` | 今天默认补录到现在；非今天避免凭空造一个今天的结束时间 |
| 用户手动选择结束时间 | 用户选中的真实 Date，且必须大于 `startTime` | 手动保存记录 |

`endTime` 的核心约束是：只要它存在，就必须晚于 `startTime`。保存手动记录、iOS picker、非 iOS picker、点「现在」都会做这个校验。

## startTime 和 endTime 的交互

主按钮根据 `endTime` 决定动作：

```ts
onClick={endTime === null ? handleStartTracking : handleSaveManualEntry}
```

- `endTime === null`：点击主按钮会调用 `handleStartTracking()`，创建一条 `endTime: null` 的进行中记录。
- `endTime !== null`：点击主按钮会调用 `handleSaveManualEntry()`，创建一条完整记录。

这也是为什么某些路径会主动清空 `endTime`。例如切换 `selectedDate` 后，主表单不知道用户想补录哪个结束时间，于是先设为 `null`，让用户明确选择或直接开始计时。相反，时间轴点击空白 gap 时，系统已经知道 gap 的 start/end，所以会同时预填 `startTime` 和 `endTime`。

## 关键计算函数

这几个函数不是平级关系，而是一条从"查记录"到"写 UI state"的层级：

```txt
getLastVisibleEndTimeForDate(entries, date)
  查：这一天时间轴视角下最后被记录覆盖到哪里

fallbackStartTimeForDate(date)
  兜底：没有可参考记录时，生成该日 + 当前时分秒

getAutoStartTimeForDate(entries, date)
  策略入口：优先用合理的记录衔接点；没有记录就 fallback

setStartTime(...)
  写入：把策略结果放进 TimeEntryForm 的 UI state
```

### `fallbackStartTimeForDate(dateStr)`

空白回落值：`dateStr` 当天 + 当前时分秒。

- 今天：等价于当前时间。
- 过去/未来日期：等价于「那一天的当前钟点镜像」。

这只在找不到当天可参考记录时使用。

### `getLastVisibleEndTimeForDate(entries, date)`

查询当前日期时间轴视角下的最后覆盖点。它查找与 `date` 当天有交集的已完成记录：

```ts
entryStart < dayEnd && entryEnd > dayStart
```

然后把 `endTime` 截断到当天 `dayEnd` 后取最大值。这样它和 EntryList / TimelineView 的「这条记录属于哪一天」语义一致。

典型跨日例子：

- `5/17 23:30 -> 5/18 00:30`
- 在 `5/17` 查询，返回 `5/17 23:59:59.999`
- 在 `5/18` 查询，返回真实 `5/18 00:30`

这个 clip 行为避免把次日凌晨的结束时间倒灌到起始日 UI 上。注意：这个函数返回的是"当天视角下可见的结束点"，不一定是记录真实 `endTime`。

### `getAutoStartTimeForDate(entries, date)`

主表单自动开始时间的策略入口。它集中处理初始化、切日期、保存后、停止后这些路径，避免每个调用点都重复写 `last visible end ?? fallback`。

普通情况下，它返回 `getLastVisibleEndTimeForDate(entries, date)`；没有可参考记录时，返回 `fallbackStartTimeForDate(date)`。

它还有一个保守 corner case：如果最后覆盖点是当天 `dayEnd`，但当天中间存在未记录 gap，则返回最早 gap 的开始时间。例子：

```txt
00:00 - 01:00          有记录
01:00 - 10:00          空白
10:00 - 次日 00:23     有记录
```

`getLastVisibleEndTimeForDate(...)` 会返回当天 `23:59:59.999`，但这个值对新建记录几乎没有意义。`getAutoStartTimeForDate(...)` 会返回 `01:00`，让用户补当天真正空出来的第一段。

## 跨午夜处理

停止计时和保存手动记录后，代码不会简单地把下一条 `startTime` 填成结束时刻。它先判断结束日期是否等于当前 `selectedDate`：

```ts
endDateStr = dayjs(endTime).format('YYYY-MM-DD')
if (endDateStr !== selectedDate) setSelectedDate(endDateStr)
else                              setStartTime(getAutoStartTimeForDate(selectedDate))
```

如果跨午夜，就先切到结束日期。切日后，`selectedDate` effect 会基于新日期重新计算自动开始时间并设置 `startTime`。这保证「用户真实活动结束在哪一天」和「UI 正在编辑哪一天」保持一致。

外部时间请求也遵守同一原则：请求里带的是真实 Date；`TimeEntryForm` 消费请求时，如果这个 Date 的日期和当前 `selectedDate` 不同，就同步切日。

## 自动跟随保护

这段逻辑解决的是一个很具体的问题：

> `entries` 变化后，表单里的 `startTime` 要不要跟着新的自动建议一起变？

系统自动设置 `startTime` 时，会同时记录：

```ts
autoStartAnchorRef.current = value.getTime()
```

这表示：当前 `startTime` 仍在跟随系统建议。之后如果用户手动选开始时间，或者外部组件发来一次明确的时间选择请求，就会清空：

```ts
autoStartAnchorRef.current = null
```

这表示：用户已经明确改过开始时间，后续 `entries` 刷新不应该偷偷覆盖它。

所以 `entries` 变化时，规则很简单：

1. 如果 `autoStartAnchorRef.current === null`，说明用户手动改过，保持 `startTime` 不动。
2. 如果锚点还在，重新计算 `getAutoStartTimeForDate(selectedDate)`。
3. 如果新的自动建议和旧锚点不同，就把 `startTime` 跟到新的自动建议。

例子：

```txt
系统自动建议: 18:00
startTime:   18:00
锚点:        18:00
```

后来上一条记录被编辑，新的自动建议变成 `18:30`。因为锚点还在，表单会自动跟随：

```txt
startTime -> 18:30
锚点      -> 18:30
```

如果用户手动把开始时间改成 `17:45`，锚点会被清空：

```txt
startTime: 17:45
锚点:      null
```

之后 entries 再变化，系统不会覆盖用户的 `17:45`。

左侧「上次结束 / 现在」徽章是另一件事：它只负责显示快捷动作。它仍用 5 秒容差判断 `startTime` 是否接近当前日期的最后可见结束点：

- `startTime` 接近当前最后可见结束点：显示「现在」，点击后跳到 `new Date()`。
- 否则：显示「上次结束」，点击后回到当前最后可见结束点。

## 修改前检查清单

改这块代码前，至少跑一遍这个心智测试：

> `5/17 23:30 -> 5/18 00:30` 这条跨日记录，在 `5/17` 和 `5/18` 的 EntryList / Timeline / 主表单「上次结束」里分别应该如何表现？

任何新增的自动写入点都要回答四个问题：

1. 它调用 `setStartTime(...)` 还是 `setEndTime(...)`，还是两个都会调用？
2. 它的时间来源是真实 Date、自动开始时间建议、fallback，还是外部 gap？
3. 它是否需要同步 `selectedDate`？
4. 它是否应该尊重用户手动改过的时间，还是明确覆盖？
