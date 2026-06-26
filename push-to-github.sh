#!/bin/bash
# Script de push vers GitHub
# Usage: bash push-to-github.sh
# Exécuter depuis le Shell Replit

set -e

REPO_URL="https://github.com/agenceialyon69/Tams-Plate-forme-.git"
BRANCH="main"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN non défini dans les secrets Replit"
  exit 1
fi

echo "📦 Staging de tous les fichiers..."
git add -A

echo "💾 Commit..."
git commit -m "feat: Railway deployment + TAMS complet (notifications, Studio video/audio, nixpacks, railway.toml)" || echo "Rien à committer"

echo "🚀 Push force vers GitHub main..."
git push "https://${GITHUB_TOKEN}@${REPO_URL#https://}" HEAD:$BRANCH --force

echo "✅ Push terminé : https://github.com/agenceialyon69/Tams-Plate-forme-"
