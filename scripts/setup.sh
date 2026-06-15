#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# KORE — one-shot setup: validates configuration, installs deps, creates the
# database tables and builds everything. Safe to re-run.
#
# Usage (from the repo root):
#   cp .env.example .env      # then fill in the values
#   bash scripts/setup.sh
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load .env if present (export every variable defined in it).
if [ -f .env ]; then
  echo "→ Loading .env"
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

fail() { echo "✗ $1" >&2; exit 1; }

# --- Required configuration -------------------------------------------------
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set (Postgres connection string)."
if [ -z "${API_AUTH_TOKEN:-}" ] || [ "${#API_AUTH_TOKEN}" -lt 16 ]; then
  fail "API_AUTH_TOKEN is missing or too short (>= 16 chars). Generate one with: openssl rand -hex 32"
fi

# --- Optional configuration (warn only) -------------------------------------
[ -n "${GEMINI_API_KEY:-}" ] || echo "⚠ GEMINI_API_KEY not set — AI extraction/analysis will return defaults."
[ -n "${GROQ_API_KEY:-}" ]   || echo "⚠ GROQ_API_KEY not set — voice transcription will be disabled."

# The web build (vite) requires these at config-eval time.
export PORT="${PORT:-8080}"
export BASE_PATH="${BASE_PATH:-/}"

# --- Install, migrate, build ------------------------------------------------
echo "→ Installing dependencies (pnpm)"
pnpm install

echo "→ Creating / updating database tables (drizzle push)"
pnpm --filter @workspace/db run push

echo "→ Type-checking and building API + web app"
pnpm run build

echo ""
echo "✓ Setup complete."
echo "  Start locally with:  bash scripts/dev.sh"
echo "  Your access token (paste it in the app's unlock screen): \$API_AUTH_TOKEN"
