# 30 — Critères d'acceptation finale

> TAMS n'est pas « terminé » tant que ces critères ne sont pas tous verts.
> Dernière mise à jour : 2026-06-26 (commit 0609fe6)

## Critères fonctionnels

- [x] Chief of Staff : briefing IA généré depuis vraies données, fallback gracieux.
- [x] Chat OS : tool-use opérationnel, injection mémoire, streaming SSE.
- [ ] Memory Graph : nœuds + edges typées, visualisation graphe, auto-linking.
- [x] Decision OS : double analyse IA, score analytique, lien tâches.
- [ ] Work OS : CRUD complet, Kanban ✓, liens contacts↔projets manquants.
- [x] Studio : assets CRUD, intégration chat, génération scripts.
- [x] Système : audit, stats, export opérationnels.

## Critères techniques

- [ ] Zéro erreur TypeScript en `pnpm run typecheck`.
- [ ] Build frontend et backend réussi.
- [x] `GET /api/healthz` retourne 200 en production.
- [ ] `memory_edges` pushée sur Railway DB.
- [x] Middlewares : rate-limit + error-handler montés.
- [x] Zéro secret exposé côté client.
- [ ] Inputs validés Zod sur tous les endpoints POST/PUT.

## Critères produit

- [ ] Chaque écran passe le test « ouvrirait-on tous les jours ».
- [ ] Aucun module sans valeur quotidienne prouvée.
- [ ] Experience mobile premium sur iOS Safari et Android Chrome.
- [ ] Temps de réponse < 300ms pour les routes non-IA.
- [x] Fallback visible si IA indisponible.

## Critères Red Team

- [x] Aucune route retournant une stack trace en production.
- [x] Rate limiting actif sur `/api/chat` et `/api/briefing`.
- [ ] Aucun N+1 DB non paginé.
- [x] Export système fonctionnel sans IA.
- [ ] Recovery documentée et testée.

## Blocages critiques (à résoudre en priorité)

1. **memory_edges non pushée** — Feature Memory Graph non fonctionnelle en production.
2. **Zod validation inconsistante** — Certains endpoints POST n'ont pas de validation.
3. **N+1 queries** — Routes `/projects` et `/tasks` sans pagination ni JOINs.
4. **Helmet.js absent** — Headers de sécurité manquants.
5. **Pas de CI/CD** — Tests automatisés et quality gates non implémentés.

## Règle finale

Ces critères ne sont pas des aspirations. Ce sont des conditions de livraison.
Un critère non vert = feature non terminée.
