# 开发指南

## 前置要求

- **Node.js** >= 18.0.0（推荐最新 LTS）
- **npm** >= 9.0.0
- **Git**

**Android 开发额外需要：**
- JDK >= 21
- Android Studio（最新版）
- Android SDK API Level 33+

**macOS 桌面端额外需要：**
- Xcode Command Line Tools

## 安装与启动

```bash
git clone https://github.com/yxr620/time_tracker.git
cd time_tracker
npm install
cp .env.example .env.local   # 按需配置 OSS 同步和 AI（可选）
npm run dev                   # http://localhost:5173
```

## 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器（HMR） |
| `npm run build` | **发布构建** — TypeScript 编译 + Vite 生产构建 → `dist/`（不含密钥） |
| `npm run build:local` | **本地构建** — 同上，但保留 `.env.local` 中的密钥（用于本地 Android 测试） |
| `npm run lint` | ESLint 检查 |
| `npm run preview` | 预览生产构建 |
| `npm run ai:debug` | AI 助手 CLI 调试 |

## 环境变量

复制 `.env.example` → `.env.local`，填入你的密钥。所有变量均可选，不配置时对应功能不可用，但应用正常运行。

### 文件结构

| 文件 | 用途 | Git 跟踪 |
|------|------|----------|
| `.env.example` | 模板，列出所有可配置变量 | ✅ 提交 |
| `.env.local` | **你的密钥**（OSS、AI 等） | ❌ gitignored |
| `.env.production` | 发布构建用，所有密钥留空 | ✅ 提交 |

```dotenv
# .env.local 示例
VITE_OSS_REGION=oss-cn-hangzhou
VITE_OSS_BUCKET=your-bucket-name
VITE_OSS_ACCESS_KEY_ID=your-access-key-id
VITE_OSS_ACCESS_KEY_SECRET=your-access-key-secret
VITE_AI_PROVIDER_ID=qwen
VITE_AI_MODEL=qwen3.6-max-preview
VITE_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_AI_API_KEY=your-api-key
```

### Vite 加载优先级（高 → 低）

- `npm run dev`（development mode）：`.env.local` > `.env`
- `npm run build`（production mode）：`.env.production` > `.env.local` > `.env`
- `npm run build:local`（localdev mode）：`.env.local` > `.env`

**关键原理**：`npm run build` 默认使用 production mode，Vite 会加载 `.env.production` 并覆盖 `.env.local`。由于 `.env.production` 中密钥为空，发布构建自动不含密钥。`npm run build:local` 使用自定义 mode，不触发 `.env.production` 覆盖，保留 `.env.local` 中的密钥。

> **应用内优先级**：localStorage 设置 > 环境变量。用户在应用内修改的配置会覆盖 env 默认值。

## AI CLI 调试

```bash
npm run ai:debug -- --data ./path/to/export.json --verbose
```

详细参数见 `npm run ai:debug -- --help`。

---

## Android 开发

### 首次设置

1. 配置 SDK 路径 — 创建 `android/local.properties`（已被 git 忽略）：

```properties
sdk.dir=/Users/你的用户名/Library/Android/sdk
```

> SDK 路径可在 Android Studio → Preferences → Android SDK 中找到。

2. 构建并同步：

```bash
npm run build && npx cap copy
```

3. 打开 Android Studio：

```bash
npx cap open android
```

### 日常开发流程

```bash
npm run build:local && npx cap copy
# 在 Android Studio 中点击 Run
```

- `npm run build:local` — TypeScript 检查 + 构建 `dist/`（包含 `.env.local` 中的密钥，用于本地调试）
- `npx cap copy` — 复制 `dist/` 到 `android/app/src/main/assets/public/`

### 推荐调试流程（当前最常用）

如果你平时主要是自己在 Android 手机上使用 Chrono，推荐直接按下面的节奏开发和调试。

#### 1. 只改 React / TypeScript / CSS 时

在仓库根目录执行：

```bash
npm run build:local
npx cap copy
```

然后去 Android Studio：

1. 选择设备
2. 点击 `Run`

这是最常见的本地自用流程，因为：

- 会保留 `.env.local` 里的密钥
- 不会被 `.env.production` 的空值覆盖
- 不需要每次都重新同步原生工程

#### 2. 改了 Capacitor 插件、Android 配置或原生依赖时

执行：

```bash
npm run build:local
npx cap sync android
```

然后再回 Android Studio 运行。

`npx cap sync android` 适用于这些情况：

- 改了 `capacitor.config.ts`
- 新增或升级了 Capacitor 插件
- 改了 `android/` 里的 Gradle / 原生配置

#### 3. 只想快速看 Web UI 时

执行：

```bash
npm run dev
```

然后在浏览器打开终端里显示的地址，默认通常是 `http://localhost:5173`。

#### 4. 想确认 Android 工程本身还能编译 Debug 包时

执行：

```bash
cd android
./gradlew assembleDebug
```

### 什么时候用 `build`，什么时候用 `build:local`

- `npm run build:local`：本地调试 / 自己日常使用，保留 `.env.local` 里的配置。
- `npm run build`：正式发布前验证和 GitHub Actions 发布流程，使用 `.env.production`，不会把本地密钥打进产物。

### 真机调试

1. 手机 → 设置 → 关于手机 → 连续点击"版本号"7 次（启用开发者选项）
2. 开发者选项 → 打开 USB 调试
3. USB 连接手机，手机上允许调试
4. Android Studio 选择设备 → Run

### 发布到 GitHub（自动打包 APK）

现在的正式发布流程已经改成：**推送 `v*` tag 到 GitHub，GitHub Actions 自动完成 Web 构建、Android 签名构建、Artifact 上传和 GitHub Release 创建。**

不再需要手动执行 `apksigner` 或 `gh release create`。

#### 一次性准备

1. 在可信机器上创建发布 keystore：

```bash
keytool -genkeypair -v \
  -keystore ~/chrono-release-key.jks \
  -alias chrono \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

2. 把 keystore 转成单行 base64：

```bash
base64 < ~/chrono-release-key.jks | tr -d '\n'
```

3. 打开 GitHub 仓库网页：

- `Settings` → `Secrets and variables` → `Actions`

4. 添加这些 repository secrets：

- `ANDROID_KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

#### 每次正式发布前先确认

在仓库根目录执行：

```bash
npm pkg get version
npm run build
grep -n "Content-Security-Policy" dist/index.html
grep -rE "LTAI|sk-[A-Za-z0-9]{20,}" dist/
```

预期结果：

- `npm pkg get version` 显示这次准备发布的版本号
- `npm run build` 成功
- CSP grep 能命中 `dist/index.html`
- 密钥 grep 没有输出

#### 标准正式发布流程（推荐长期使用）

假设你要发布的版本号已经在 `package.json` 里。

在仓库根目录执行：

```bash
VERSION=$(npm pkg get version | tr -d '"')
git checkout main
git pull origin main
git push origin main
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

然后去 GitHub 网页查看：

1. `Actions` → `Release`
2. 确认最新的 workflow run 成功
3. 打开 `Artifacts`，确认至少看到：
   - `android-apk`
   - `web-dist`
4. 打开 `Releases`，确认出现稳定版 `v${VERSION}`

#### 如果目标版本还没写进 `package.json`

可以先在 `main` 上执行一次版本升级：

```bash
git checkout main
git pull origin main
npm version patch
git push origin main --follow-tags
```

说明：

- `npm version patch` 会把版本从例如 `0.0.3` 升到 `0.0.4`
- 它会同时更新 `package.json` 和 `package-lock.json`
- 默认还会创建一个 git commit 和一个 tag（例如 `v0.0.4`）
- `git push origin main --follow-tags` 会把 commit 和 tag 一起推上去，从而触发 GitHub Release workflow

如果当前 `package.json` 已经是你要发的版本，**不要再跑 `npm version patch`**，否则会多升一个版本。

#### 需要先做 rehearsal 时

如果你想先用一个临时分支和 `-rc` tag 做预演，再发稳定版，可以这样做：

```bash
VERSION=$(npm pkg get version | tr -d '"')
git checkout main
git pull origin main
git checkout -B public
git push -u origin public
git tag "v${VERSION}-rc.1"
git push origin "v${VERSION}-rc.1"
```

然后去 GitHub 网页检查：

1. `Actions` 里的 `Release` workflow 成功
2. `Artifacts` 里有 `android-apk` 和 `web-dist`
3. `Releases` 里出现 `v${VERSION}-rc.1`，并且是 `Pre-release`
4. 把 APK 装到测试设备上确认能运行

预演通过后，再回到稳定版发布：

```bash
VERSION=$(npm pkg get version | tr -d '"')
git checkout main
git merge --ff-only public
git push origin main
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

#### `public` 分支要不要保留

- `main`：推荐作为长期主分支和正式发布基线
- `public`：适合作为临时 rehearsal / 发布预演分支

如果 `public` 已经完成使命，并且和 `main` 指向同一个 commit，可以删除，减少分支混乱：

```bash
git push origin --delete public
git branch -d public
```

删除后不会影响已经发布的 tag 和 GitHub Release。

#### 安全原理

`npm run build` 使用 Vite production mode，自动加载 `.env.production`（密钥为空）覆盖 `.env.local`（含密钥）。无需手动移除任何文件。

```
npm run build          → production mode → .env.production (空密钥) → 发布安全 ✅
npm run build:local    → localdev mode   → .env.local (有密钥)     → 本地调试 ✅
```

#### 安全注意事项

1. **密钥只存放在 `.env.local`** — 该文件被 `.gitignore` 忽略，不会提交到 Git
2. **`.env.production` 中密钥必须为空** — 这是发布构建的安全保障
3. **Keystore (`*.jks`) 不要提交到 Git**
4. **密钥泄露处理**：删除 Release → 禁用旧 AccessKey → 重新生成 API Key

#### 版本号规范

 采用 Semantic Versioning：`0.0.x`（早期）→ `0.x.0`（迭代）→ `1.0.0+`（正式）。Android 的 `versionCode` 和 `versionName` 会在构建时从 `package.json` 自动派生。

常见规则：

- 已经把 `package.json` 调到目标版本：直接打 `vX.Y.Z` tag 发布
- 还没调到目标版本：先执行一次 `npm version patch|minor|major`

#### 附录：创建签名密钥（仅首次）

```bash
keytool -genkeypair -v \
  -keystore ~/chrono-release-key.jks \
  -alias chrono \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

---

## macOS 桌面端开发（Electron）

### 首次设置

```bash
npm install @capacitor-community/electron
npx cap add @capacitor-community/electron
```

### 构建与运行

```bash
npm run build
npx cap sync @capacitor-community/electron
cd electron && npm run electron:start    # 调试端口 5858
```

### 打包发布

```bash
cd electron
npm install
npm run electron:make    # 生成 .dmg / .app
```

打包产物在 `electron/dist` 目录。

**数据存储**：`~/Library/Application Support/Chrono/`

---

## 数据导出与导入

### 导出

应用支持三种导出方式：
- **全量导出**：所有记录、目标、类别
- **增量导出**：自上次同步后的新数据
- **时间范围导出**：指定时间段

导出格式为 JSON。文件名格式：`time-tracker-{type}-YYYYMMDD-HHmmss.json`

### 导入

两种导入策略：
- **合并模式**（推荐）：保留现有数据，相同 ID 的记录会被更新
- **替换模式**：清空所有现有数据后导入（不可撤销）

操作：导出页 → 导入数据 → 选择策略 → 选择 JSON 文件。

---

## 常见问题

**端口 5173 被占用？** — 检查终端输出的实际 URL，或关闭占用进程。

**Android Studio 找不到 SDK？** — 检查 `android/local.properties` 的 `sdk.dir` 路径。

**Android 应用未更新？** — 本地自用调试通常应先执行 `npm run build:local && npx cap copy`，如果改了插件或原生配置，再改用 `npm run build:local && npx cap sync android`。

**清空 IndexedDB 数据？**
- Web：浏览器 DevTools → Application → Storage → Clear Site Data
- Android：设置 → 应用 → Chrono → 清除数据

**多设备数据恢复？** — 旧设备全量导出 → 传输文件 → 新设备导入（替换模式）。如已配置 OSS 同步，数据会自动同步。

---

## Git 提交规范

```
feat: 新功能
fix: Bug 修复
docs: 文档更新
style: 代码格式
refactor: 重构
perf: 性能优化
chore: 构建/工具链
```
