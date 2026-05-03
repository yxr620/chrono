#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[deploy] Building..."
npm run build

echo "[deploy] Installing production deps in dist/..."
cp package.json dist/
cd dist
npm install --omit=dev --no-package-lock
cd ..

echo "[deploy] Zipping..."
rm -f chrono-api.zip
( cd dist && zip -rq ../chrono-api.zip . )

echo "[deploy] Created chrono-api.zip"
echo
echo "Next: upload chrono-api.zip to Function Compute console:"
echo "  函数计算 FC → chrono-api → 函数代码 → 上传代码"
echo "  Handler: index.handler"
echo
