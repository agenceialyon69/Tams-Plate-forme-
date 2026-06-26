# 30 — Critères d'acceptation finale

> TAMS n'est pas « terminé » tant que ces critères ne sont pas tous verts.

## Critères fonctionnels

- [ ] Chief of Staff : briefing IA généré depuis vraies données, fallback gracieux.
- [ ] Chat OS : tool-use opérationnel, injection mémoire, streaming.
- [ ] Memory Graph : nœuds + edges typées, visualisation graphe, auto-linking.
- [ ] Decision OS : double analyse IA, score analytique, lien tâches, timeline.
- [ ] Work OS : CRUD complet, Kanban, liens contacts↔projets.
- [ ] Studio : assets CRUD, intégration chat, export.
- [ ] Système : audit, stats, export, recovery opérationnels.

## Critères techniques

- [ ] Zéro erreur TypeScript en `pnpm run typecheck`.
- [ ] Build frontend et backend réussi.
- [ ] `GET /api/healthz` retourne 200 en production.
- [ ] `memory_edges` pushée sur Railway DB.
- [ ] Middlewares : rate-limit + request-logger + error-handler montés.
- [ ] Zéro secret exposé côté client.
- [ ] Inputs validés Zod sur tous les endpoints POST/PUT.

## Critères produit

- [ ] Chaque écran passe le test « ouvrirait-on tous les jours ».
- [ ] Aucun module sans valeur quotidienne prouvée.
- [ ] Experience mobile premium sur iOS Safari et Android Chrome.
- [ ] Temps de réponse < 300ms pour les routes non-IA.
- [ ] Fallback visible si IA indisponible.

## Critères Red Team

- [ ] Aucune route retournant une stack trace en production.
- [ ] Rate limiting actif sur `/api/chat` et `/api/briefing`.
- [ ] Aucun N+1 DB non paginé.
- [ ] Export système fonctionnel sans IA.
- [ ] Recovery documentée et testée.

## Règle finale

Ces critères ne sont pas des aspirations. Ce sont des conditions de livraison.
Un critère non vert = feature non terminée.
