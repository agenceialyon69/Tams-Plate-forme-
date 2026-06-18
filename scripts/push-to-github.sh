#!/bin/bash
# Script de push GitHub pour GANDAL
# Usage: GITHUB_TOKEN=<ton_token> bash scripts/push-to-github.sh
# OU: ajoute GITHUB_TOKEN dans les secrets Replit, puis lance: bash scripts/push-to-github.sh

set -e

REMOTE_URL="https://github.com/agenceialyon69/Tams-Plate-forme-"
BRANCH="main"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN non défini."
  echo ""
  echo "Option 1 : Lance avec le token en préfixe :"
  echo "  GITHUB_TOKEN=ghp_xxx bash scripts/push-to-github.sh"
  echo ""
  echo "Option 2 : Ajoute GITHUB_TOKEN dans les secrets Replit (Tools → Secrets)"
  echo "  puis relance : bash scripts/push-to-github.sh"
  exit 1
fi

echo "📦 Staging tous les fichiers..."
git add -A

echo "✅ Commit en cours..."
git commit -m "feat: GANDAL v2 — audit trail, red team, diagnostics, command palette, AI provider selector

- DB: table audit_logs (log automatique de toutes les écritures)
- Backend: /api/audit, /api/diagnostics, /api/export, /api/red-team/run
- Middleware audit: non-bloquant, log async sur toutes les routes write
- Frontend: pages /audit, /red-team, /diagnostics
- Command palette globale (⌘K) avec navigation + actions rapides
- QuickCapture déplacé sur ⌘J
- Settings: sélecteur provider IA (Gemini/Ollama/désactivé), export JSON
- Fix TypeScript: req.params.id cast en String() dans leads.ts
- ensure-schema: CREATE TABLE IF NOT EXISTS audit_logs" || echo "ℹ️ Rien à committer (déjà commité)"

echo "🔐 Configuration des credentials GitHub..."
# Configure le remote avec le token intégré dans l'URL
AUTH_REMOTE="https://${GITHUB_TOKEN}@${REMOTE_URL#https://}"
git remote set-url origin "$AUTH_REMOTE"

echo "🚀 Push vers main..."
git push origin "$BRANCH"

# Restaure l'URL sans credentials
git remote set-url origin "$REMOTE_URL"

echo ""
echo "✅ Push réussi sur https://github.com/agenceialyon69/Tams-Plate-forme- (branche main)"
echo ""
echo "🚂 Railway va redéployer automatiquement depuis main."
echo "   Vérifie sur https://railway.app ton déploiement."
