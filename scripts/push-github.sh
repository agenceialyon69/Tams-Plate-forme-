#!/usr/bin/env bash
# push-github.sh — Pousse les commits locaux sur la branche main de GitHub
# Usage: bash scripts/push-github.sh
# Prérequis : GITHUB_TOKEN doit être défini dans les secrets Replit
#             (ou exporté manuellement: export GITHUB_TOKEN=ghp_xxx)

set -e

REPO="https://github.com/agenceialyon69/Tams-Plate-forme-.git"
BRANCH="main"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌  GITHUB_TOKEN non défini."
  echo "   → Va dans Replit > Secrets et ajoute GITHUB_TOKEN=ghp_xxxx"
  echo "   → Crée le token sur : https://github.com/settings/tokens (scope: repo)"
  exit 1
fi

echo "🚀  Push vers $REPO branche $BRANCH …"
git push "https://${GITHUB_TOKEN}@${REPO#https://}" "$BRANCH"
echo "✅  Push réussi ! Railway va déployer automatiquement."
