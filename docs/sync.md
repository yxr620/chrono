# 同步架构

## 概述

同步功能基于**阿里云 OSS**，采用**本地优先 + Snapshot-First** 架构。OSS 未配置时应用完全可用，同步是可选功能。

### 核心特性

- **本地优先**：所有数据首先写入本地 IndexedDB，离线可用
- **Snapshot-First**：每次 Pull 先检查 snapshot（全量快照），再叠加增量 oplog，即使 oplog 被清理也不丢数据
- **LWW 冲突解决**：用 `updatedAt` 时间戳，最后写入的版本胜出，合并幂等
- **软删除传播**：删除操作标记 `deleted: true` 并同步到所有设备
- **自动清理**：每次 Push 后自动清理旧 oplog，OSS 文件数 ≈ 设备数 × 2
- **低成本**：< ¥0.01/月

## 文件分工

| 文件 | 职责 |
|---|---|
| `src/services/db.ts` | Dexie Schema、Syncable 接口、同步辅助函数 |
| `src/services/syncDb.ts` | 同步感知的 CRUD（自动记录 oplog，软删除） |
| `src/services/oss.ts` | 阿里云 OSS 封装（分页列表、oplog/snapshot CRUD） |
| `src/services/syncConfig.ts` | 同步本地设置持久化（自动同步开关 + BYO OSS 配置） |
| `src/services/syncAvailability.ts` | 按当前模式判断同步是否就绪（BYO 凭据 / Managed 登录态） |
| `src/services/gateway/*` | Paid feature gateway 抽象；在 BYO 与 Managed 之间路由同步凭据 |
| `src/services/syncEngine.ts` | **同步引擎核心**（Push / Pull / LWW 合并、Snapshot-First、清理） |
| `src/services/syncToast.ts` | 同步状态 Toast 事件总线 |
| `src/services/syncDebugTools.ts` | 浏览器控制台调试工具（`window.syncDebug`） |
| `src/services/autoPush.ts` | 数据变更后自动触发增量 Push |
| `src/stores/syncStore.ts` | 同步 UI 状态（Zustand） |
| `src/stores/authStore.ts` | Managed 模式下的登录态、JWT 与当前用户 |

## BYO 与 Managed

- **BYO**：同步凭据来自应用内保存的 OSS 配置或 `.env`。远端路径前缀是 `sync/{userId}/`，其中 `userId` 来自 `localStorage.userId`，缺失时回落到 `default-user`。
- **Managed**：客户端先向 Chrono 后端请求 `/auth/sts`，拿到 1 小时的 STS 临时凭据，再由浏览器直接访问 OSS。远端路径前缀仍然是 `sync/{userId}/`，但这里的 `userId` 必须等于登录账号的 Chrono user id。
- **两种模式共享本地 IndexedDB，但不共享远端命名空间**。切换模式不会迁移已有远端数据，只会改变后续读写的 bucket/前缀。
- **自动同步开关是模式无关的偏好项**。只有在当前 sync mode 已启用且已就绪时，自动 Push / 启动时 Pull 才会真正执行。

## 数据流

### Push 流程

```
数据变更（entryStore / goalStore）
  → syncDb 自动记录 SyncOperation（synced: false）
  → autoPush() 触发 incrementalPush()
      1. 查询 syncOperations 中 synced = false 的记录
      2. 按 tableName:recordId 去重，同一记录只保留最新操作
      3. 上传压缩后的 oplog → sync/{userId}/oplog/{deviceId}_{timestamp}.json
      4. 将原始操作标记为 synced = true
      5. 生成全量 snapshot（含 deleted tombstone）→ sync/{userId}/snapshots/{deviceId}.json（覆盖）
      6. 清理本设备除最新 1 个之外的旧 oplog
```

### Pull 流程（Snapshot-First）

```
应用启动 / 手动触发 → incrementalPull()
  Phase 1 — Snapshot 合并：
    1. listSnapshotFiles() 获取所有其他设备的 snapshot（含 lastModified）
    2. 对比本地缓存的 lastSnapshotPullTimestamps
    3. 仅下载 lastModified 有变化的 snapshot → LWW 合并
    （未变化时：1 次 listObjects，0 次下载）

  Phase 2 — 增量 Oplog：
    1. 列出 lastProcessedTimestamp 之后其他设备的 oplog 文件
    2. 逐文件下载 → LWW 合并
    3. 更新游标 lastProcessedTimestamp
```

### LWW 合并规则

```
本地不存在该记录 → 直接写入
本地存在该记录 → 比较 updatedAt：
  remote.updatedAt > local.updatedAt → 覆盖本地
  否则 → 忽略（本地更新更新）
```

合并幂等：对同一记录重复合并 N 次，结果不变。

## 触发机制

### 自动触发

> 自动同步开关存储在 `localStorage`（key: `autoSyncEnabled`），新设备**默认关闭**。在「同步管理」页面开启。

| 时机 | 操作 | 前置条件 |
|---|---|---|
| 应用启动 | 增量 Pull | `isSyncReady()`（自动同步开关开启，且当前 sync mode 已就绪） |
| 数据变更后 | 增量 Push（via `autoPush`） | `isSyncReady()` |

当前 mode 的“已就绪”定义：

- **BYO**：已保存有效的 OSS 凭据（应用内或 `.env`）。
- **Managed**：sync mode 已切到 `managed`，且用户已登录 Chrono 账号。

涉及的写操作：`startTracking` / `stopTracking` / `addEntry` / `updateEntry` / `deleteEntry` / `addGoal` / `updateGoal` / `deleteGoal`。

### 手动触发

不受自动同步开关影响，在「同步管理」页面操作：

```typescript
syncEngine.incrementalSync()    // 增量 Push + Pull
syncEngine.incrementalPush()    // 仅增量 Push
syncEngine.incrementalPull()    // 仅增量 Pull
syncEngine.forceFullSync()      // 全量 Push + Pull（数据恢复）
syncEngine.forceFullPush()      // 全量 Push
syncEngine.forceFullPull()      // 全量 Pull
syncEngine.resetSyncState()     // 重置同步游标
syncEngine.cleanupSyncedOperations(days)  // 清理本地已同步操作日志
syncEngine.purgeDeletedRecords(days)      // 物理删除软删除记录
```

### 并发安全（withSyncGuard）

所有公开同步 API 均通过 `withSyncGuard` 保护：
- 检查 `isSyncing` 锁，防止并发同步
- `autoPush` 与手动触发互斥
- 统一 try/catch/finally 错误处理

## OSS 文件结构

```
OSS Bucket/
└── sync/
    └── {userId}/
        ├── oplog/
        │   ├── {deviceId1}_{timestamp}.json   # 每设备通常只保留最新 1 个
        │   └── {deviceId2}_{timestamp}.json
        └── snapshots/
            ├── {deviceId1}.json               # 每设备一个，覆盖写入
            └── {deviceId2}.json
```

    在 Managed 模式下，这里的 `{userId}` 是 Chrono 账号的 user id；后续 Plan 5 的用户数据管理平面也将基于这一前缀枚举设备和统计存储量。

### Oplog 文件格式

```json
[
  {
    "id": "uuid",
    "timestamp": "2026-02-19T10:00:00.000Z",
    "deviceId": "device-uuid",
    "tableName": "entries",
    "recordId": "record-uuid",
    "type": "create",
    "data": { "id": "record-uuid", "activity": "学习", "deleted": false, ... }
  }
]
```

### Snapshot 文件格式

```json
{
  "deviceId": "device-uuid",
  "timestamp": 1708300800000,
  "entries": [ ... ],
  "goals": [ ... ],
  "categories": [ ... ]
}
```

快照包含该设备的**全部**数据，含 `deleted: true` 的 tombstone。

## 配置 OSS（阿里云）

### 1. 创建 Bucket

在[阿里云 OSS 控制台](https://oss.console.aliyun.com)创建 Bucket：读写权限设为**私有**，存储类型选标准存储。

### 2. 配置 CORS

Bucket → 权限管理 → 跨域设置：

| 字段 | 值 |
|---|---|
| 来源 | 推荐逐行填写：`http://localhost:5173`、`https://localhost`、`http://localhost`、`capacitor://localhost`，以及正式 Web 域名 |
| 允许 Methods | `GET, POST, PUT, DELETE, HEAD` |
| 允许 Headers | `*` |

说明：Managed 模式下浏览器会拿着 STS 临时凭据直接访问 OSS，所以 bucket 必须允许前端 origin 发起跨域请求。为了省事直接填 `*` 也能工作，但更推荐显式列出实际 origin。

### 3. 创建 AccessKey

在 [RAM 控制台](https://ram.console.aliyun.com/users)创建用户，授予 `AliyunOSSFullAccess`。

### 4. 填入应用

**推荐**：应用内「设置 → 同步管理」填写 Region / Bucket / AccessKey ID / Secret。

或 `.env` 文件（重启开发服务器生效）：

```env
VITE_OSS_REGION=oss-cn-hangzhou
VITE_OSS_BUCKET=your-bucket-name
VITE_OSS_ACCESS_KEY_ID=your-key-id
VITE_OSS_ACCESS_KEY_SECRET=your-key-secret
```

**优先级**：应用内配置（localStorage）> .env。

**传输加速**：如需跨地域，在阿里云控制台开启「传输加速」，将 `VITE_OSS_REGION` 改为 `oss-accelerate`。

## 数据清理

| 清理项 | 触发方式 | 默认保留 |
|---|---|---|
| OSS 旧 oplog | 每次 Push 后自动 | 最新 1 个 |
| 本地已同步操作日志 | `sync()` 自动 / 手动 | 7 天 |
| 软删除记录 | 手动（同步管理页） | 30 天 |

## 故障排查

| 问题 | 排查步骤 |
|---|---|
| 同步失败 | 查看控制台 `[Sync]` / `[OSS]` 日志；BYO 检查 AccessKey 权限 / Bucket 名称，Managed 检查登录态、`/auth/sts` 响应与 bucket CORS |
| 数据不一致 | 所有设备执行「增量同步」；仍不一致则「强制全量同步」 |
| 同步状态异常 | 「重置同步状态」→「增量同步」 |
| Electron 同步失败 | `electron/src/setup.ts` 的 `webPreferences` 添加 `webSecurity: false`，CSP 添加阿里云域名 |
| OSS 被清空 | 有数据的设备执行「强制全量 Push」 |
| 本地数据丢失 | 执行「强制全量 Pull」 |

## 成本估算

| 项目 | 费用 |
|---|---|
| 存储（~100KB） | ≈ ¥0.00001/月 |
| 下载流量（~24MB/月） | ≈ ¥0.012/月 |
| API 请求（~600次/月） | ≈ ¥0.0001/月 |
| **合计** | **< ¥0.01/月** |
