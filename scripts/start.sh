#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# KORE — single-service run: the API serves the web app too. One process, one
# URL. Run `bash scripts/setup.sh` first (it builds everything).
#
# Usage (from the repo root):
#   bash scripts/start.sh
#   → open http://localhost:8080 and paste your API_AUTH_TOKEN
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

fail() { echo "✗ $1" >&2; exit 1; }
[ -n "${DATABASE_URL:-}" ]   || fail "DATABASE_URL is not set. See .env.example."
[ -n "${API_AUTH_TOKEN:-}" ] || fail "API_AUTH_TOKEN is not set. See .env.example."

if [ ! -f artifacts/api-server/dist/index.mjs ]; then
  fail "Build missing. Run: bash scripts/setup.sh"
fi
if [ ! -f artifacts/kore/dist/public/index.html ]; then
  echo "⚠ Web app build not found — running API only. Run scripts/setup.sh to include the web app." >&2
fi

export PORT="${PORT:-8080}"
export NODE_ENV="${NODE_ENV:-production}"

echo "→ KORE running on http://localhost:$PORT"
echo "   Access token to paste in the unlock screen: $API_AUTH_TOKEN"
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
