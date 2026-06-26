# 32 — Critères d'acceptation finale

> TAMS n'est pas « terminé » tant que ces critères ne sont pas tous verts.
> Dernière mise à jour : 2026-06-26 (commit 96fb610)

## Critères fonctionnels

- [x] Chief of Staff : briefing IA généré depuis vraies données, fallback gracieux.
- [x] Chat OS : tool-use opérationnel, injection mémoire, streaming SSE.
- [ ] Memory Graph : nœuds + edges typées ✓, visualisation graphe manquante.
- [x] Decision OS : double analyse IA, score analytique, lien tâches.
- [x] Work OS : CRUD complet, Kanban ✓, cascade delete ✓, `project_contacts` déployée.
- [x] Studio : assets CRUD, intégration chat, génération scripts.
- [x] Système : audit, stats, export opérationnels.

## Critères techniques

- [ ] Zéro erreur TypeScript en `pnpm run typecheck`.
- [ ] Build frontend et backend réussi (environnement pnpm requis).
- [x] `GET /api/healthz` retourne 200 en production.
- [x] `memory_edges` déployée sur Supabase.
- [x] `project_contacts` déployée sur Supabase.
- [x] Middlewares : rate-limit + error-handler + helmet montés.
- [x] Zéro secret exposé côté client.
- [x] Inputs validés Zod sur tous les endpoints POST/PATCH.
- [x] N+1 queries éliminées (JOINs + aggregation).
- [x] Pagination sur tous les endpoints liste.

## Critères Red Team

- [x] Aucune route retournant une stack trace en production.
- [x] Rate limiting actif sur 5 endpoints IA.
- [x] Helmet.js headers de sécurité installés.
- [x] CORS restrictif en production.
- [x] Export système fonctionnel sans IA.
- [ ] Recovery documentée et testée (import manquant).
- [ ] CI/CD GitHub Actions implémentée.

## Progression globale

- Fonctionnel : 80%
- Technique : 85%
- Produit : 60%
- Red Team : 75%

**Score composite : 75%**
