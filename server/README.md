# chrono-server

Aliyun Function Compute backend for Chrono Managed Services.

## Local build

```bash
npm install
npm run build
```

## Deploy

1. Set FC env vars in the console (see plan 3 task 8).
2. `./deploy.sh` produces `chrono-api.zip`.
3. Upload via FC console → 函数代码 → 上传代码.
4. Handler: `index.handler`.

## Endpoints

- POST /auth/register      { email, password }
- POST /auth/login         { email, password }
- GET  /me/features        (auth)

(Additional endpoints land in plans 4-6.)
