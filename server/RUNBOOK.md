# Chrono Server Runbook

操作指南：如何在阿里云 FC 上为 Chrono 后端做日常运维。

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
