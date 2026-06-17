#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Pre-start validation — fail fast with clear error messages instead of a
# cryptic crash that Railway shows as a blank page.
# ---------------------------------------------------------------------------

MISSING=""

if [ -z "$API_AUTH_TOKEN" ]; then
  echo "[railway-start] ERROR: API_AUTH_TOKEN is not set."
  echo "[railway-start] Go to Railway → your service → Variables and add:"
  echo "[railway-start]   API_AUTH_TOKEN = <run: openssl rand -hex 32>"
  MISSING="1"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[railway-start] ERROR: DATABASE_URL is not set."
  echo "[railway-start] Go to Railway → your service → Variables and add:"
  echo "[railway-start]   DATABASE_URL = postgresql://postgres.snlpjpuxspmuvuvbqhyb:...@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
  MISSING="1"
fi

if [ -n "$MISSING" ]; then
  echo "[railway-start] Required environment variables are missing. Exiting."
  exit 1
fi

echo "[railway-start] All required variables present. Starting server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
