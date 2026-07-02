# Dev Agent Pro v5 Report

## Verdict Red Team

**Statut : WARN / Fondation sérieuse, pas encore Claude Code complet.**

Cette PR ajoute une fondation Dev Agent Pro v5 au-dessus des briques déjà mergées : permissions, jobs, history, ops, Life OS final et CI.

## Ce qui est réellement connecté

- Routes API Dev Agent Pro v5.
- Sandbox mission en mode safe/dry-run.
- Command plan allowlisté.
- Blocage des commandes dangereuses.
- Repo Intelligence v2 foundation : status, search, routes, file context.
- Context compaction : facts, decisions, risks, notes.
- Sous-agents spécialisés en dry-run.
- Diff preview empty-state contrôlé.
- Benchmark 30 missions avec smoke exécutable.
- Session memory in-memory.
- Plugin registry avec statuts honnêtes.
- Auto-repair v2 contrôlé en dry-run.
- Page `/dev-agent-pro`.
- Smoke CI et E2E.

## Ce qui est partial

- Terminal sandbox complet : partial, car l'API ne doit pas exécuter un shell arbitraire en production.
- Worktrees isolés : simulés par mission/sandbox, pas encore vrais worktrees Git locaux.
- Repo index permanent : foundation, pas encore index DB complet de tous les symboles.
- Session memory : fallback mémoire, pas encore persistence DB dédiée.
- Auto-repair : plan/hypothèse/dry-run, pas encore patch automatique complet.

## Ce qui est disabled / requires_sandbox

- Shell libre : disabled.
- Commandes dangereuses : blocked.
- Push direct main : interdit.
- Exécution locale complexe réelle : requires_sandbox local/runner isolé.
- Plugin Railway réel : missing_config tant que les accès ne sont pas configurés.

## Endpoints ajoutés

- `GET /api/dev-agent/pro/status`
- `POST /api/dev-agent/pro/sandbox`
- `GET /api/dev-agent/pro/sandbox/:id`
- `POST /api/dev-agent/pro/sandbox/:id/command`
- `GET /api/dev-agent/pro/sandbox/:id/logs`
- `POST /api/dev-agent/pro/sandbox/:id/close`
- `POST /api/dev-agent/pro/command-plan`
- `GET /api/dev-agent/pro/command-plan/:id`
- `POST /api/dev-agent/pro/command-plan/:id/run`
- `GET /api/dev-agent/pro/command-plan/:id/logs`
- `POST /api/dev-agent/pro/repo-index/scan`
- `GET /api/dev-agent/pro/repo-index/status`
- `GET /api/dev-agent/pro/repo-index/search`
- `GET /api/dev-agent/pro/repo-index/routes`
- `GET /api/dev-agent/pro/repo-index/files/:path`
- `POST /api/dev-agent/pro/context/compact`
- `GET /api/dev-agent/pro/context/:missionId`
- `POST /api/dev-agent/pro/context/:missionId/append`
- `GET /api/dev-agent/pro/context/:missionId/summary`
- `GET /api/dev-agent/pro/subagents`
- `POST /api/dev-agent/pro/subagents/run`
- `GET /api/dev-agent/pro/diff`
- `GET /api/dev-agent/pro/benchmark`
- `GET /api/dev-agent/pro/sessions`
- `POST /api/dev-agent/pro/sessions`
- `GET /api/dev-agent/pro/plugins`
- `POST /api/dev-agent/pro/repair`

## Benchmark

Script :

```bash
pnpm --filter @workspace/scripts dev-agent:benchmark -- --smoke
```

Le benchmark contient 30 missions contractuelles couvrant : API, frontend, sécurité, ops, DB, providers, recovery, Dev Agent CI, jobs, memory, plugins, session memory, diff preview, subagents, command plan, context compaction et rollback.

## Comparaison honnête avec Claude Code

| Domaine | Score | Verdict |
|---|---:|---|
| Sandbox terminal | 45/100 | WARN |
| Command execution | 50/100 | WARN |
| Repo intelligence | 60/100 | WARN |
| Context compaction | 65/100 | PASS foundation |
| Sub-agents | 55/100 | WARN |
| Diff preview | 55/100 | WARN |
| Benchmark | 65/100 | PASS foundation |
| Session memory | 50/100 | WARN |
| Plugin/MCP ecosystem | 55/100 | WARN |
| Auto-repair | 50/100 | WARN |
| Security | 80/100 | PASS |
| Proximité Claude Code globale | 60/100 | WARN |

## Prochaine étape

Pour approcher vraiment Claude Code :

1. Runner local isolé réel ou GitHub Actions ephemeral sandbox.
2. Vrais worktrees par sous-agent.
3. Index DB des symboles et routes avec scan incrémental.
4. Patch generation + diff preview avec approbation humaine.
5. Repair loop qui modifie réellement une branche, bornée et testée.
6. Benchmark complet exécutant de vrais changements sur branches temporaires.

## Verdict global

**WARN : Dev Agent Pro v5 Foundation est une vraie base sérieuse, mais pas encore équivalente à Claude Code en puissance brute.**
