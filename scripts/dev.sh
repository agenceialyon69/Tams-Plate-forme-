#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# KORE — local development: runs the API server and the web frontend together.
# Ctrl-C stops both.
#
# Usage (from the repo root):
#   bash scripts/dev.sh
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

# Default ports for local dev.
export PORT="${PORT:-8080}"
# Let the browser app reach the local API by default.
export VITE_API_URL="${VITE_API_URL:-http://localhost:${PORT}}"

API_PID=""
cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Starting API server on :$PORT"
pnpm --filter @workspace/api-server run dev &
API_PID=$!

echo "→ Starting web frontend (Vite)"
echo "   API token to paste in the unlock screen: $API_AUTH_TOKEN"
pnpm --filter @workspace/kore run dev
