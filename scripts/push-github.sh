#!/usr/bin/env bash
# push-github.sh — Pousse les commits locaux sur la branche main de GitHub
# Usage: bash scripts/push-github.sh
# Prérequis : GITHUB_TOKEN dans les secrets Replit (scope: repo)

set -e

REPO_OWNER="agenceialyon69"
REPO_NAME="Tams-Plate-forme-"
BRANCH="main"
REMOTE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌  GITHUB_TOKEN non défini."
  echo "   → Va dans Replit > Tools > Secrets et ajoute GITHUB_TOKEN=ghp_xxxx"
  echo "   → Crée le token sur : https://github.com/settings/tokens (classic, scope: repo)"
  exit 1
fi

echo "🚀  Push vers ${REMOTE_URL} branche ${BRANCH} …"

GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false \
  git -c credential.helper='' \
  push "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git" "${BRANCH}" 2>&1

echo "✅  Push réussi ! Railway va déployer automatiquement."
