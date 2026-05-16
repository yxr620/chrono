# Chrono Server Runbook

操作指南：如何在阿里云 FC 上为 Chrono 后端做日常运维。

---

## 配置前端来源白名单 / Configure CORS origins

FC 控制台 → `chrono-api` 函数 → **配置 → 环境变量** → 设置 `CORS_ALLOWED_ORIGINS`。

推荐至少包含这些值（逗号分隔，无空格）：

```text
https://your-web-domain.example,https://localhost,http://localhost,capacitor://localhost
```

- `https://localhost`：当前 Capacitor Android WebView 默认 origin
- `http://localhost`：旧 Android 配置或自定义 scheme 时仍可能出现
- `capacitor://localhost`：Capacitor iOS WebView
- 另外再加正式 Web 域名

服务端会把 `https://localhost`、`http://localhost` 与 `capacitor://localhost` 视为同一组本地 app origin，但环境变量里把三者都写上更清晰，也便于排查 `Failed to fetch` 这类 CORS 问题。

---

## 添加用户到白名单 / Add a user to the allowlist

1. FC 控制台 → 进入 `chrono-api` 函数 → **配置 → 环境变量**
2. 找到 `ALLOWED_SYNC_EMAILS` 与/或 `ALLOWED_AI_EMAILS`
3. 在原值末尾追加 `,user@example.com`（逗号分隔，无需空格）
4. 保存。新调用在几秒内生效（旧实例会复用直到回收）

## 移除用户 / Remove a user

同上，从逗号列表中删去对应邮箱并保存。

## 强制注销用户（应急）/ Force-delete a user

1. OSS 控制台 → bucket → `admin/users.json` → 下载
2. 编辑 JSON，移除该用户记录（保留 `version` 字段并 +1）
3. 重新上传，覆盖原文件
4. 该用户的 JWT 在下次校验时即失效（`findUserById` 找不到）

如需同时清掉数据：删除 `sync/{userId}/` 前缀。

## 轮换 JWT_SECRET / Rotate JWT_SECRET

1. 生成新值：`openssl rand -base64 32`
2. FC 环境变量 → 更新 `JWT_SECRET` → 保存
3. 所有现有 JWT 立即失效，用户需重新登录

## 轮换 OSS 管理员 AK/SK

1. RAM → 用户 → `chrono-fc-admin` → 创建 AccessKey
2. FC 环境变量 → 更新 `OSS_ACCESS_KEY_ID` 与 `OSS_ACCESS_KEY_SECRET` → 保存
3. RAM → 删除旧 AccessKey

## 部署新版本

```bash
cd server
./deploy.sh                 # 生成 dist/ + chrono-api.zip
```

FC 控制台 → `chrono-api` → 上传 `chrono-api.zip` → 部署。

## 查看日志

FC 控制台 → `chrono-api` → 日志。SLS 查询可按 request id、错误码筛选。

## 监控建议（可选）

- FC 错误率（首两周建议盯到 < 1%）
- OSS 存储增长（`sync/` 下的 GiB 走势）
- 每日 `chat/completions` 调用计数（防止白名单外漏写）

## Streaming relay (since 2026-05-16)

`/v1/chat/completions` 把上游 SSE chunk 逐块透传，而不是 buffer 整段后一次性返回。代码层面已经支持，**但 FC HTTP 触发器必须切到「流式调用」模式**，否则 FC 会把整段响应缓存好再返回（用户视角：等十几秒、然后一整段 push 出来）。

### 在 Aliyun FC 3.0 控制台切流式

1. 控制台 → **函数计算 FC 3.0** → 函数列表 → `chrono-api`
2. 顶部菜单 → **配置** → 左侧 **触发器**
3. 找到 HTTP 触发器（通常名字是 `defaultTrigger` 或自定义名）→ **编辑**
4. **调用方式 / Invocation Method** 下拉：
   - 默认：`同步调用 (Sync)` ← 当前状态，FC 会 buffer
   - 改为：**`流式调用 (Stream)`** ← 我们要的
5. 保存。新调用在几秒内生效（旧实例会复用直到回收，可以再点一次 **执行版本管理 → 发布版本** 触发滚动）

如果在 FC 3.0 控制台找不到「调用方式」字段：

- 路径变体 A：函数详情 → **配置 → 网络与流式响应** → 流式响应：开启
- 路径变体 B：触发器编辑页 → 高级配置 → 响应模式：流式

阿里云官方文档关键词：「**HTTP 流式响应函数**」、「**stream invocation**」。

### 验证流式是否生效

部署后用 curl 直接看响应 header。响应里现在带两个诊断 header：

```bash
# 先登录拿 JWT
TOKEN=$(curl -s -X POST https://YOUR-FC-URL/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"xxx"}' | jq -r '.token')

# 用 -N 禁掉 curl 自身的 buffer，-D - 打印 headers
curl -N -D - -X POST https://YOUR-FC-URL/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"hi"}],"stream":true}'
```

判读结果：
- `X-Chrono-Streaming: true` → ✅ FC 触发器已经是流式，代码 ​​已逐 chunk `respObj.write`
- `X-Chrono-Streaming: false`、`X-Chrono-Stream-Reason: respObj-missing-write` → ❌ FC 触发器还是同步调用，buffered fallback 起作用了；回去再切一次
- `X-Chrono-Streaming: false`、`X-Chrono-Stream-Reason: no-response-object` → 函数被 FC 当 event 函数调用了（不太可能，但记录下来便于排查）

curl 输出本身也能直观看：流式的话 `data:` 行会一行一行往下走；buffered 的话最后 EOF 时整段一次性 dump。

### FC 函数日志能看到什么

部署本版后，每个 `/v1/chat/completions` 请求会打一行：
- `[stream] respObj.write available — streaming chunks 1:1`（✅）
- `[stream] respObj.write missing — FC trigger is request-response, buffering full body`（❌ 触发器还没切）
- `[stream] FC invoked us with no respObj — falling back to buffered relay`（FC 当 event 函数调用了）

FC 控制台 → 函数详情 → **日志** → 按 request id 过滤。
