# chrono-server

Aliyun Function Compute backend for Chrono Managed Services.

## Required env vars

Set these in the FC console before uploading `chrono-api.zip`:

- `JWT_SECRET`
- `OSS_REGION`
- `OSS_BUCKET`
- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`
- `CORS_ALLOWED_ORIGINS`

`CORS_ALLOWED_ORIGINS` should include every frontend origin that will call the API. For Chrono deployments that means your web origin plus the Capacitor app origins:

```text
https://your-web-domain.example,https://localhost,http://localhost,capacitor://localhost
```

The server treats `https://localhost`, `http://localhost`, and `capacitor://localhost` as equivalent local app origins so current Android builds, older Android configs, and iOS builds all work even if only one of them is configured, but keeping all of them in the env var is clearer for operators.

## Local build

```bash
npm install
npm run build
```

## Deploy

1. Set FC env vars in the console.
2. `./deploy.sh` produces `chrono-api.zip`.
3. Upload via FC console → 函数代码 → 上传代码.
4. Handler: `index.handler`.

## Endpoints

- POST /auth/register      { email, password }
- POST /auth/login         { email, password }
- GET  /me/features        (auth)

(Additional endpoints land in plans 4-6.)
