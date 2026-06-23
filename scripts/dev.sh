#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# KORE — local development: runs the API (port 8080) and the web frontend
# (port 5173) together. The web dev server proxies /api to the API, so there's
# no CORS and no VITE_API_URL to set. Ctrl-C stops both.
#
# Usage (from the repo root):
#   bash scripts/dev.sh
#   → open http://localhost:5173 and paste your API_AUTH_TOKEN
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
[ -n "${DATABASE_URL:-}" ]   || fail "DATABASE_URL is not set. Did you create .env? See .env.example."
[ -n "${API_AUTH_TOKEN:-}" ] || fail "API_AUTH_TOKEN is not set. See .env.example."

# The web dev server proxies /api to localhost:8080 (see vite.config.ts), so
# the API must listen on 8080 while the web app uses a different port.
API_PORT=8080
WEB_PORT="${WEB_PORT:-5173}"

API_PID=""
cleanup() { [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "→ Starting API server on :$API_PORT"
PORT="$API_PORT" pnpm --filter @workspace/api-server run dev &
API_PID=$!

echo "→ Starting web frontend on :$WEB_PORT"
echo "   Open http://localhost:$WEB_PORT  —  access token: $API_AUTH_TOKEN"
PORT="$WEB_PORT" BASE_PATH="/" pnpm --filter @workspace/kore run dev
