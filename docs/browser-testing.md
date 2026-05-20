# 浏览器验证流程（Claude Code + Chrome DevTools MCP）

本文件是 Claude 在浏览器里验证 UI/交互的**标准流程**。CLAUDE.md 里有一条强制规则指向这里。

## 核心原则：两条互不干扰的车道

| 车道 | 命令 | 端口 | Chrome | 数据 |
|------|------|------|--------|------|
| **用户日常** | `npm run dev` | 5173 | 用户日常的 Chrome | 真实数据 |
| **Claude 测试** | `npm run dev:test` | 5180（strictPort） | chrome-devtools-mcp 拉起的专用 profile | 测试数据 |

两层隔离同时生效，Claude 测试**碰不到用户真实数据**：

1. **Server 隔离**：Claude 只起 `dev:test`（5180），**永不启动、永不依赖、永不干扰用户的 `npm run dev`（5173）**。
2. **数据隔离**：MCP 拉起的是独立 Chrome profile（独立 user-data-dir），其 IndexedDB / localStorage 与用户日常 Chrome 完全分开；且 5180 与 5173 是不同 origin，IndexedDB 本就各自独立。

## 标准步骤

### 1. 起测试 server（后台）

```bash
npm run dev:test   # run_in_background，固定 http://localhost:5180
```

若 5180 被占用，`--strictPort` 会直接报错（不会偷偷换端口）—— 说明已有一个测试 server 在跑，直接复用即可。

### 2. 打开页面

用 `mcp__chrome-devtools__navigate_page` 访问 `http://localhost:5180/`，然后 `take_screenshot` + `list_console_messages` 看首屏与报错。

### 3. 选功能档位（account 系统）

档位存在 localStorage 键 `chrono_feature_modes`，每个功能取值 `disabled` / `byo` / `managed`。

- **disabled（默认，95% 的 UI 工作用这个）**：纯本地，不登录、不联网、零成本。大部分 UI / 交互 / 布局验证用这一档就够。
- **byo（自带 OSS 同步测试）**：见下方"红线"，必须改 `localStorage.userId` 隔离同步路径。
- **managed（托管模式测试）**：需登录 `VITE_AUTH_API_URL`，**会真实调用后端 + LLM 代理 = 真花钱**，少用、按需用，且只用专用测试账号。

### 4. 装 / 清测试数据

DB 名 `TimeTrackerDB`（IndexedDB）。导出/导入格式见 `src/services/export.ts`。

**清空（每个测试之间，避免状态串味）** —— `mcp__chrome-devtools__evaluate_script`：

```js
() => new Promise((resolve, reject) => {
  const req = indexedDB.deleteDatabase('TimeTrackerDB');
  req.onsuccess = () => resolve('deleted');
  req.onerror = () => reject(req.error);
  req.onblocked = () => resolve('blocked — close other tabs then reload');
})
```

删完后 `navigate_page`（type=reload）让 app 重新建库并 seed 预设类别。

**装样本数据** —— 推荐 `evaluate_script` 直接写 IndexedDB（最稳，不依赖 UI）。Vite dev 会直接 serve 仓库里的 fixture（实测 `GET /tests/fixtures/sample-entries.json` → 200 application/json），所以页面能直接 fetch，fixture 保持单一来源：

```js
async () => {
  const res = await fetch('/tests/fixtures/sample-entries.json');
  const { data: { entries, goals, categories } } = await res.json();
  const d = (v) => (v ? new Date(v) : v);
  const e2 = entries.map(e => ({ ...e, startTime: d(e.startTime), endTime: e.endTime ? d(e.endTime) : null, createdAt: d(e.createdAt), updatedAt: d(e.updatedAt) }));
  const g2 = goals.map(g => ({ ...g, createdAt: d(g.createdAt), updatedAt: d(g.updatedAt), ...(g.completedAt ? { completedAt: d(g.completedAt) } : {}) }));
  const c2 = categories.map(c => ({ ...c, createdAt: d(c.createdAt), updatedAt: d(c.updatedAt) }));
  const db = await new Promise((ok, no) => { const r = indexedDB.open('TimeTrackerDB'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  await new Promise((ok, no) => {
    const tx = db.transaction(['entries','goals','categories'], 'readwrite');
    tx.oncomplete = ok; tx.onerror = () => no(tx.error);
    c2.forEach(c => tx.objectStore('categories').put(c));
    g2.forEach(g => tx.objectStore('goals').put(g));
    e2.forEach(e => tx.objectStore('entries').put(e));
  });
  return 'seeded';
}
```

写完 `navigate_page`（type=reload）刷新，让 stores 重新读库。

> 备选：app 真实导入路径在 **设置页 → "导入数据"**（`BackupSection.tsx`，按钮触发弹窗选 MERGE/REPLACE 策略后才打开隐藏 file input）。能复用经过测试的 `importFromJSON`，但中间有 action-sheet，对自动化不如上面的直接写库顺手。

样本数据是 **2026-05-20** 一整天 10 条记录 + 3 个目标（含 1 个打卡型），categories 用 6 个预设。注意它是**固定日期**：若当天不是 2026-05-20，需在"记录"页把日期切到 2026-05-20 才能看到这些数据。

### 5. 验证

- 多视口：`resize_page` 切宽窄，分别验证桌面布局（≥1024px，侧边栏 + Dashboard/Trends/AI/Maintenance）和移动布局（<1024px，底部 tab：记录/目标/导出）。
- 视觉：`take_screenshot`（必要时 `fullPage:true`）。
- 报错：`list_console_messages` / `list_network_requests`。
- 交互：`click` / `fill` / `fill_form` / `press_key`，配合 `take_snapshot` 拿元素 uid。

### 6. 收尾（验证结束必做）

- **停掉自己起的 `dev:test`（5180）后台进程**，别留孤儿进程。用启动它的后台任务句柄结束（Bash 后台任务的 kill / KillShell），**绝不动用户的 `npm run dev`（5173）**。
- 测试数据留在 MCP Chrome 的隔离 profile 里，无害；如需下次干净起步，按第 4 步用 `indexedDB.deleteDatabase('TimeTrackerDB')` 清掉即可。
- 若测试中切过功能档位 / 改过 `localStorage.userId`，复位或清掉，别让状态残留到下次。

## ⚠️ 红线（必须守住）

1. **绝不启动或干扰用户的 `npm run dev`（5173）**。Claude 只用 `dev:test`（5180）。
2. **BYO 同步测试前**，先 `evaluate_script` 设 `localStorage.setItem('userId','claude-test')`，把 OSS 路径隔离到 `sync/claude-test/...`，**绝不污染用户真实的 `sync/{userId}/`**。最好再用专用测试 bucket。
3. **Managed 测试只用专用测试账号**（测试邮箱进 allowlist），绝不用用户本人账号 / 真实额度。
4. MCP Chrome 的 localStorage 跨测试持久化 —— 切换档位 / 换 userId 时**主动清**，别让上次状态残留。

## 已知工具坑（重要）

- **`take_snapshot` 会把 Ionic `<ion-button>` 误报成 `disabled`**，即使按钮实际可用。实测：设置页的"导入数据"等按钮快照标 `disableable disabled`，但 `evaluate_script` 读到 `button.disabled === false`、`pointer-events:auto`、`opacity:1`，`click` 也能正常触发弹窗。**别凭快照的 `disabled` 标注下结论**——拿不准就用 `evaluate_script` 读真实 DOM，或直接 `click` 试。
- **隐藏的 `<input type=file>`（`display:none`）不进快照**，拿不到 uid。需要时先 `evaluate_script` 把它 `style.display='block'`，再 `take_snapshot` 取 uid，然后 `upload_file`。导入流程实测可走通：点"导入数据" → 弹窗选"合并导入" → un-hide input → `upload_file` 喂 `tests/fixtures/sample-entries.json` → 出现"导入成功"对话框。

## 已知无害报错

全新空库首次加载时 console 可能出现 `[SyncStore] 加载同步统计失败: [object DexieError2]` —— 未配置同步 + 空库下属预期，非阻塞。
