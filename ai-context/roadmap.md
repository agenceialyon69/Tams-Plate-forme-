# Roadmap

Principe : une feature = un cycle (analyse → red team → decision gate → plan →
implémentation → tests → commit/push → maj progress.md). Stabilité d'abord.

## MVP (en cours — la base doit être stable et cohérente)
1. ✅ Auth fonctionnelle (login/register/reset, JWT, token maître).
2. ✅ Déploiement service unique stable (Railway) + migrations idempotentes.
3. ✅ Durcissement sécurité de base (inscription fermée, reset non fuité,
   exports protégés, rate-limit auth).
4. ⏳ **Branding unifié TAMS** (retirer KORE/GANDAL visibles). ← prochaine tâche
5. ⏳ Dashboard : signaux honnêtes (pas de faux timestamps / fausse charge).
6. ⏳ Settings : compte + workspace + intégrations + branding.
7. ⏳ `ai-context` maintenu (fait, à tenir à jour à chaque cycle).

## V1 (Phase 1 — base SaaS propre et réutilisable)
- Users system propre (déjà avancé : rôles, invitations, garde-fous).
- Analytics structure (événements utiles, usage réel) — minimal.
- Billing structure (placeholder plans/quotas — quotas déjà présents).
- Onboarding minimal (réduire la friction d'entrée).
- Tests de base + CI minimale + Docker de base.
- Début d'extraction `core-template` (auth/users/settings) sans casser l'existant.

## V2 (Phase 2 — capacités équipe & gouvernance)
- **Isolation multi-tenant complète** (`tenantId` sur toutes les tables data) —
  prérequis avant tout usage multi-clients.
- Workspace / team management.
- Audit logs (présent) consolidé, Notifications, Feature flags.
- Seed / reset / bootstrap propres, template versioning.

## V3 (Phase 3 — IA, uniquement quand la base est stable)
- AI Gateway / router multi-LLM (modèle rapide vs fort, fallback).
- IA gratuite d'abord : Ollama (obligatoire), Qwen, DeepSeek R1, Llama.
- AI Copilot central + agents (Dev/Business/Marketing/Research/Document).
- Gouvernance IA : prompts/agents/schémas versionnés, logs, evals/red-team.

## Règle de priorisation
Si une feature n'est pas indispensable au MVP réel d'un utilisateur, elle est
**reportée**. Voir `rules.md` (Red Team checklist).
