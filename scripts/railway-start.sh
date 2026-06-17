#!/bin/sh
set -e

if [ -z "$API_AUTH_TOKEN" ]; then
  echo "ERROR: API_AUTH_TOKEN is not set in Railway Variables"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set in Railway Variables"
  exit 1
fi

echo "Starting KORE server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs