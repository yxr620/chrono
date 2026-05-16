#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[deploy] Building..."
npm run build

echo "[deploy] Removing test artifacts from dist/..."
find dist -name "*.test.js" -delete

echo "[deploy] Installing production deps in dist/..."
cp package.json dist/
cd dist
npm install --omit=dev --no-package-lock
cd ..

echo "[deploy] Adding Custom Runtime bootstrap..."
cp bootstrap dist/bootstrap
chmod +x dist/bootstrap

echo "[deploy] Zipping..."
rm -f chrono-api.zip
( cd dist && zip -rq ../chrono-api.zip . )

echo "[deploy] Created chrono-api.zip"
echo
echo "Next: upload chrono-api.zip to Function Compute console."
echo
echo "Web / Custom Runtime mode (true SSE streaming):"
echo "  Runtime: custom.debian10"
echo "  Listen port: 9000"
echo "  Startup: /code/bootstrap"
echo
