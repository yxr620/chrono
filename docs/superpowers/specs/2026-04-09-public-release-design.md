# Chrono Public Release — Design Spec

**Date:** 2026-04-09  
**Status:** Draft  
**Scope:** Security hardening, auth + access control, automated release pipeline

## Overview

Prepare Chrono for public release with three sub-projects executed in order:
1. **Security hardening** — audit and fix before going public
2. **Auth + access control** — login system with allowlist-gated OSS sync and AI
3. **Automated release pipeline** — GitHub Actions, tag-triggered

Core principle: Chrono remains **local-first**. Auth is only required for sync and AI.

---

## Sub-project 1: Security Hardening

### 1.1 Environment Variable Audit

- Remove `VITE_OSS_ACCESS_KEY_SECRET` and `VITE_AI_API_KEY` from `.env.example` (no longer client-side after auth migration)
- Add comments to `.env.example` clarifying the new auth-based flow
- Verify Vite only exposes `VITE_`-prefixed vars; confirm no server secrets can leak into the bundle
- Ensure `.env` is explicitly listed in `.gitignore` (currently only `.env.local` and `.env.*.local` are covered)

### 1.2 localStorage Scope Reduction

After auth migration:
- **Kept:** JWT auth token, user profile, UI preferences (dark mode, etc.), per-provider AI UI settings (excluding API keys)
- **Removed:** Raw OSS credentials (`accessKeyId`, `accessKeySecret`), AI API keys
- The JWT token is the only sensitive item in localStorage; it expires in 7 days

### 1.3 Android Keystore

- Keystore file (`chrono-release-key.jks`) must NEVER be committed to the repo
- For CI: stored as GitHub Secret `ANDROID_KEYSTORE_BASE64` (base64-encoded)
- Related secrets: `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
- Add `*.jks` and `*.keystore` to `.gitignore`

### 1.4 Content Security Policy

Add CSP meta tag to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self'; 
           script-src 'self'; 
           style-src 'self' 'unsafe-inline'; 
           connect-src 'self' https://*.aliyuncs.com https://*.oss-accelerate.aliyuncs.com;
           img-src 'self' data: blob:;">
```
Note: `style-src 'unsafe-inline'` is required by Ionic's runtime styling. `connect-src` allows OSS and FC endpoints.

### 1.5 Git History Check

- Scan git history for accidentally committed secrets (`git log --all -p | grep -i "accesskey\|secret\|password\|apikey"`)
- If found: rotate affected credentials immediately, consider `git filter-repo` to scrub

---

## Sub-project 2: Auth + Access Control

### 2.1 Architecture

```
┌──────────────────────────────────────────────────┐
│ Chrono Client (Web / Android / Electron)         │
│                                                  │
│  authStore ──→ POST /auth/login ──→ JWT          │
│  syncEngine ──→ POST /auth/sts ──→ STS token     │
│       └──→ OSS (direct, temp credentials)        │
│  aiService ──→ POST /auth/ai ──→ proxied LLM     │
└──────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ Aliyun Function Compute (FC)                     │
│                                                  │
│  POST /auth/register  → create user              │
│  POST /auth/login     → verify password → JWT    │
│  POST /auth/sts       → verify JWT + allowlist   │
│                         → AssumeRole STS token   │
│  POST /auth/ai        → verify JWT + allowlist   │
│                         → proxy to LLM API       │
│                                                  │
│  Environment Variables:                          │
│    JWT_SECRET, OSS_BUCKET, OSS_REGION,           │
│    OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET,     │
│    STS_ROLE_ARN, AI_API_KEY, AI_BASE_URL,        │
│    AI_MODEL, ALLOWED_EMAILS                      │
│                                                  │
│  User Storage:                                   │
│    admin/users.json in private OSS bucket        │
│    (bcrypt-hashed passwords)                     │
└──────────────────────────────────────────────────┘
```

### 2.2 Backend: Aliyun FC Functions

**Runtime:** Node.js 18 on Aliyun FC  
**API Gateway:** Aliyun API Gateway or FC HTTP trigger with custom domain  
**Location:** `server/` directory in this repo (keeps deployment simple; can extract to separate repo later if needed)

#### Endpoints

**POST /auth/register**
- Input: `{ email, password }`
- Validate email format, password strength (min 8 chars)
- Check if email already exists in `admin/users.json`
- Hash password with bcrypt (cost factor 12)
- Store user record: `{ id: uuid, email, passwordHash, createdAt }`
- Return `{ token: JWT, user: { id, email } }`

**POST /auth/login**
- Input: `{ email, password }`
- Lookup user by email, verify bcrypt hash
- Return `{ token: JWT, user: { id, email } }`
- JWT payload: `{ sub: userId, email, iat, exp }` (7-day expiry)

**POST /auth/sts**
- Header: `Authorization: Bearer <JWT>`
- Verify JWT, check email is in `ALLOWED_EMAILS`
- Call Aliyun STS AssumeRole, scoped to `sync/{userId}/*` in the OSS bucket
- Return `{ accessKeyId, accessKeySecret, securityToken, expiration }` (1-hour TTL)
- If not in allowlist: return `403 { error: "sync_not_enabled", message: "Sync is not available for your account" }`

**POST /auth/ai**
- Header: `Authorization: Bearer <JWT>`
- Body: OpenAI-compatible chat completion request
- Verify JWT, check email is in `ALLOWED_EMAILS`
- Forward request to configured LLM API with server-side API key
- Stream response back to client
- If not in allowlist: return `403 { error: "ai_not_enabled" }`

#### User Storage (MVP)

User records stored in `admin/users.json` in a private OSS bucket:
```json
{
  "users": [
    {
      "id": "uuid-1",
      "email": "user@example.com",
      "passwordHash": "$2b$12$...",
      "createdAt": "2026-04-09T00:00:00Z"
    }
  ]
}
```

This is adequate for <100 users. Migrate to Tablestore if user base grows.

**Concurrency note:** For MVP with a small user base, read-modify-write on the JSON file is acceptable. For scale, move to Tablestore.

#### Allowlist Management

`ALLOWED_EMAILS` FC environment variable:
```
ALLOWED_EMAILS=you@email.com,friend@email.com,earlyuser@email.com
```

To grant/revoke access: update the FC environment variable and redeploy (or use FC console). No code change needed.

### 2.3 STS Policy (IAM)

Create an Aliyun RAM role `chrono-sync-user` with a trust policy allowing FC to assume it. The STS session policy scopes access to the user's folder:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject",
        "oss:DeleteObject",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:BUCKET_NAME/sync/${userId}/*"
      ]
    }
  ]
}
```

This ensures user A cannot read/write user B's sync data.

### 2.4 Client Changes

#### New: `src/stores/authStore.ts`

```typescript
interface AuthStore {
  user: { id: string; email: string } | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}
```

- JWT stored in `localStorage` under key `auth_token`
- On app load, check for existing token, validate expiry client-side
- On logout, clear token + user from localStorage

#### New: `src/services/authService.ts`

- `register(email, password)` → POST `/auth/register`
- `login(email, password)` → POST `/auth/login`
- `getStsToken()` → POST `/auth/sts` (with JWT)
- `proxyAiRequest(messages, tools)` → POST `/auth/ai` (with JWT)

#### New: `src/components/Auth/LoginPage.tsx`

- Simple email + password form
- Toggle between login / register mode
- Shown when app launches if `!isAuthenticated`
- After successful login, navigate to main app

#### Modified: `src/services/oss.ts`

- Replace static OSS credentials with STS token flow
- Before any OSS operation: check if STS token is valid (not expired)
- If expired or missing: call `authService.getStsToken()`
- Create OSS client with temporary credentials + security token
- `getUserId()` now returns the authenticated user's ID (from authStore)

#### Modified: `src/services/syncConfig.ts`

- Remove user-entered OSS credential fields
- Config simplified to: `{ enabled: boolean }` (credentials come from STS)
- Backend URL stored as env var: `VITE_AUTH_API_URL`

#### Modified: `src/services/ai/llmClient.ts`

- When auth is available: route requests through `authService.proxyAiRequest()`
- Fallback: if user has configured their own API key (BYO), use direct calls (preserve existing behavior for users who prefer their own keys)

#### Modified: `src/components/SyncManagementPage/SyncManagementPage.tsx`

- Remove OSS credential input form
- Show sync status + login prompt if not authenticated
- Show "Sync not available for your account" if authenticated but not on allowlist

#### Modified: `src/components/AIAssistant/AISettings.tsx`

- Show "AI powered by Chrono backend" if authenticated and on allowlist
- Keep BYO API key option for users who prefer their own provider/key

### 2.5 Backward Compatibility

- Existing users with BYO OSS credentials: keep working (check localStorage for legacy config, use if present)
- New env var `VITE_AUTH_API_URL` — if not set, app works in legacy BYO mode
- Migration path: when user logs in, legacy BYO config is preserved as fallback

### 2.6 New Environment Variables

```env
# Auth backend URL (required for auth features)
VITE_AUTH_API_URL=https://your-fc-endpoint.cn-hangzhou.fcapp.run

# Legacy BYO credentials still work if auth is not configured
# VITE_OSS_* vars become optional (only for BYO mode)
```

---

## Sub-project 3: Automated Release Pipeline

### 3.1 CI Workflow: `.github/workflows/ci.yml`

Runs on every push and PR to `main`:
- Checkout → install deps → `npm run lint` → `npm run build`
- Fails fast if lint or build fails

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

### 3.2 Release Workflow: `.github/workflows/release.yml`

Triggered by pushing a tag matching `v*`:

```yaml
name: Release
on:
  push:
    tags: ['v*']
```

**Jobs:**

1. **build-web** — Build web assets, upload as artifact
2. **build-android** — Build signed APK
3. **create-release** — Create GitHub Release with APK attached

#### Android Build Job (key steps):

```yaml
build-android:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: 17
    - run: npm ci
    - run: npm run build
    - run: npx cap copy android
    - name: Decode keystore
      run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/chrono-release.jks
    - name: Build signed APK
      working-directory: android
      run: ./gradlew assembleRelease
      env:
        KEYSTORE_FILE: app/chrono-release.jks
        KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
        KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
        KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
    - uses: actions/upload-artifact@v4
      with:
        name: android-apk
        path: android/app/build/outputs/apk/release/*.apk
```

Note: Android `build.gradle` needs a signing config block that reads from environment variables.

#### GitHub Release Job:

```yaml
create-release:
  needs: [build-web, build-android]
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - uses: actions/download-artifact@v4
    - uses: softprops/action-gh-release@v2
      with:
        generate_release_notes: true
        files: |
          android-apk/*.apk
        prerelease: ${{ contains(github.ref, '-beta') || contains(github.ref, '-rc') }}
```

### 3.3 Version Bumping Process

Manual, standard npm flow:
```bash
# Bump version in package.json, create git tag
npm version patch  # or minor/major
# Push commit and tag
git push && git push --tags
```

The tag push triggers the release workflow automatically.

### 3.4 Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` keystore file |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias in the keystore |
| `KEY_PASSWORD` | Key password |

Set via GitHub repo → Settings → Secrets and variables → Actions.

### 3.5 Android Signing Config

Add to `android/app/build.gradle`:
```groovy
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_FILE") ?: "chrono-release.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

---

## Implementation Order

1. **Security hardening** (1 session) — audit, fix .gitignore, add CSP, scan history
2. **Release pipeline** (1 session) — CI + release workflows, android signing config
3. **Auth backend** (1-2 sessions) — FC functions, user storage, STS integration
4. **Auth client** (1-2 sessions) — authStore, login UI, modify oss.ts/syncConfig/aiClient

Release pipeline (#2) is moved before auth (#3) because it's independent and immediately useful — you can start releasing builds while auth is being developed.

---

## Out of Scope

- Web hosting / public web app (deferred to future)
- macOS DMG release automation (can add later)
- Payment / billing system
- Rate limiting (add when needed)
- Email verification (can add as enhancement)
- Password reset flow (can add as enhancement)
