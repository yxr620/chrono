# 真实本地数据诊断

本文档记录 Codex / Claude Code 在用户明确要求后，如何用 Chrono 的真实本地数据复现数据依赖型 bug。它是 `docs/browser-testing.md` 中隔离测试流程的受控例外，不是常规 UI 验证手段。

## 何时可以使用

只有同时满足以下条件时才可以使用真实数据：

- 用户正在要求诊断一个依赖其本地历史数据的具体问题。
- 使用测试 fixture 无法可靠复现，或重建相同历史关系的成本明显更高。
- 用户明确知道会读取其本地 Chrono 数据，并批准必要的文件系统或隔离浏览器操作。

“检查布局”、“验证按钮”、“跑回归测试”等普通任务不构成读取真实数据的授权，必须继续使用 5180 + 隔离测试 profile。

## 当前能力与限制

Chrono 目前没有专用的“导出预测诊断包”CLI。当前可用方式是：

1. 只读定位正在复现问题的 origin 对应的 IndexedDB。
2. 将它复制到系统临时目录，作为诊断快照。
3. 用快照启动独立的 headless Chrome profile。
4. 在该隔离页面中加载仓库当前的 `db.ts` 和被调试业务模块，执行只读查询与业务函数。
5. 只输出与问题相关的最小证据，停止隔离 Chrome，删除准确的临时快照目录。

这个流程可以使用真实历史关系复现问题，但仍属于人工诊断。不应宣称已存在稳定的诊断导出命令。

## 受控快照流程

### 1. 确认真实 origin

IndexedDB 按 origin 隔离。先让用户确认问题发生在哪个客户端和 URL，例如：

- Chrome 开发页：`http://localhost:5173/`
- Electron：`capacitor-electron://-`
- 其他端口或协议会使用不同的 IndexedDB 目录

不要猜测 origin。也不要为了诊断而停止、重启或替换用户的 5173 服务。如果它已经在运行，只复用它来加载当前源码。

### 2. 定位 IndexedDB

macOS Chrome 的 origin 数据通常位于：

```text
/Users/<user>/Library/Application Support/Google/Chrome/<profile>/IndexedDB/
```

例如 `http://localhost:5173/` 通常对应：

```text
http_localhost_5173.indexeddb.leveldb
```

先用只读命令核对目录的修改时间和大小。不得在源目录上直接启动另一个 Chrome，不得修改、移动或删除源目录。

### 3. 创建临时快照

使用 `mktemp -d` 创建专用目录，记住它返回的精确路径。在该目录中建立下列相对结构，然后只复制目标 origin 的 IndexedDB：

```text
<temporary-profile>/Default/IndexedDB/<origin>.indexeddb.leveldb
```

不复制 Chrome 的 Cookie、密码、历史、其他 origin 或整个用户 profile。快照可能包含 Chrono 中的个人活动和目标名，必须始终留在本机。

### 4. 启动隔离 Chrome

使用专用临时 profile 和专用调试端口打开第 1 步确认的 URL。示意参数：

```text
Google Chrome
  --headless=new
  --no-first-run
  --no-default-browser-check
  --user-data-dir=<temporary-profile>
  --remote-debugging-port=<dedicated-port>
  http://localhost:5173/
```

启动 GUI / headless Chrome 和打开本地调试端口都应遵循当前执行环境的批准流程。绝不把用户日常 Chrome profile 作为 `--user-data-dir`。

### 5. 在页面内重放

通过 Chrome DevTools Protocol 在 Chrono 页面上下文执行诊断。优先动态导入当前源码，确保重放使用的是仓库中正在检查的实现：

```js
const [{ db }, predictor] = await Promise.all([
  import('/src/services/db.ts'),
  import('/src/services/metadataPredictor.ts'),
]);

await db.open();
const goals = (await db.goals.toArray()).filter(goal =>
  !goal.deleted &&
  (goal.type ?? 'time') !== 'check' &&
  goal.date === selectedDate
);

predictor.invalidatePredictionCache();
const result = await predictor.predictMetadata(activity, goals);
```

查询必须保持只读：

- 可以使用 `toArray()` / `get()` / `where()` 和纯业务函数。
- 不得调用 `add()` / `put()` / `update()` / `delete()` / `clear()` / `bulkPut()`。
- 不得启动同步、AI 请求、备份恢复或任何写入型 action。
- 不得将原始数据发送给网络服务。

预测问题至少要固定并记录：

- 原始输入和页面选中日期。
- 快照时间、时区和代码版本（包括工作区是否有未提交修改）。
- 当天的候选目标。
- 最近 60 天内 exact / strong 命中的历史活动。
- 这些历史活动关联的目标名和聚合次数。
- 规范化片段、匹配类型、得分、置信度和最终 `reason`。

工具输出中不要打印整库。如果查询结果过多，在页面内先过滤和聚合，再将最小必要证据返回给 Codex。

### 6. 收尾

诊断结束后：

1. 停止自己启动的隔离 Chrome，不得停止用户的日常 Chrome 或 5173 服务。
2. 仅删除 `mktemp` 返回的那个精确临时目录；删除前按当前执行环境的规则请求批准。
3. 在结论中说明原数据没有被修改，临时快照已删除。
4. 不要在仓库、聊天回复或长期日志中保留完整原始记录。

## 预测问题的报告模板

结论应当包含可验证的决策链，而不是只说“算法可能匹配了历史”：

```text
输入：<activity>
页面日期：<YYYY-MM-DD>
预测结果：<goal/category + confidence + reason + score>

触发链：
  当前输入
  → 命中的历史活动及 match type
  → 历史关联的目标/类别及次数
  → 与当天候选的 remap type / overlap score
  → 提升或降级 confidence 的代码规则
  → 表单最终是否自动填充
```

如果数据中没有记录“手动选择”还是“旧版自动预测”等来源，必须明确说无法从现有数据判断，不要将推测写成事实。

## 未来的推荐实现

上述 profile 快照 + CDP 适合当前的紧急诊断，但不应成为长期 CLI 接口。未来更安全的方案是：

- 在应用内生成最小化、可预览的 prediction debug bundle。
- 默认只包含相关的活动聚合、目标名、匹配片段和分数；排除 memo、账号、设备、同步与 AI 配置。
- 将预测核心拆成接收显式 context 的纯函数，生产代码和 CLI 重放使用同一实现。
- CLI 读取诊断包并输出结构化决策 trace，例如 `debug:prediction -- explain <bundle>`。
- 脱敏后的诊断包可以转换为回归 fixture；原始诊断包必须留在本机临时目录并及时删除。

在这个功能真正实现前，未来的 Codex 应当使用本文档的受控快照流程，不得虚构已存在的导出命令。
