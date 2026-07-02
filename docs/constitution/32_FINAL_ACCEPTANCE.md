# 32 — Critères d'acceptation finale

> TAMS n'est pas « terminé » tant que ces critères ne sont pas tous verts.
> Dernière mise à jour : 2026-07-02, après PR #72, #73 et #74.

## Critères fonctionnels

- [x] Chief of Staff : briefing IA généré depuis vraies données, fallback gracieux.
- [x] Chat OS : tool-use opérationnel, injection mémoire, streaming/SSE, persistance locale anti-disparition.
- [x] Memory Graph : nœuds + edges typées + visualisation graphe présentes.
- [x] Decision OS : double analyse IA, score analytique, lien tâches.
- [x] Work OS : CRUD complet, Kanban, cascade delete, `project_contacts` déployée.
- [x] Studio : assets CRUD, intégration chat, génération scripts, fallback TikTok, image gratuite.
- [x] Vidéo : `video.generate` produit un MP4 réel via FFmpeg slideshow.
- [x] Providers : recherche web, automation, musique, transcription et voix ont des handlers backend branchés.
- [x] Système : audit, stats, métriques, version, export, VIS et selftest opérationnels.
- [ ] Personal Life OS : direction constitutionnelle validée, mais système complet santé/famille/finances/admin encore à construire.

## Critères techniques

- [x] Zéro erreur TypeScript sur le pipeline CI récent.
- [x] Build frontend et backend réussis sur le pipeline CI récent.
- [x] `GET /api/healthz` retourne 200.
- [x] `GET /api/version` expose une version/commit exploitable.
- [x] `GET /api/system/validate` disponible.
- [x] `GET /api/system/selftest` disponible.
- [x] `GET /api/system/metrics` disponible.
- [x] `memory_edges` déployée sur Supabase/Postgres.
- [x] `project_contacts` déployée sur Supabase/Postgres.
- [x] Middlewares : rate-limit + error-handler + helmet montés.
- [x] Zéro secret exposé côté client.
- [x] Inputs validés sur les endpoints sensibles.
- [x] CI/CD GitHub Actions implémentée.
- [x] E2E navigateur Playwright lancé dans le pipeline récent.
- [ ] Recovery import/restauration complète à tester.
- [ ] Validation manuelle production Railway après chaque gros merge.

## Critères Red Team

- [x] Aucune route ne doit masquer une erreur critique par un faux PASS.
- [x] Les capacités non configurées doivent répondre clairement `missing_config`, `planned`, `read_only` ou `plan_only`.
- [x] Pas de promesse de génération IA vidéo si seul un plan ou fallback est produit.
- [x] Les providers optionnels sont séparés des capacités réellement disponibles.
- [x] Export système protégé sans authentification.
- [x] Logs et statuts CI consultables sans exposer de valeurs sensibles.
- [x] Les actions GitHub/Dev Agent restent encadrées par flags et routes dédiées.
- [ ] Recovery documentée et testée de bout en bout.
- [ ] Scénarios métier longue durée à valider en usage réel.

## Progression globale estimée

- Fonctionnel : 88%
- Technique : 92%
- Produit : 70%
- Red Team : 88%

**Score composite : 85%**

## Verdict

La **V1 plateforme** est validée. Le **produit final** ne l'est pas encore : il reste à prouver l'usage réel, la stabilité production Railway, les workflows métier, le Personal Life OS et le recovery complet.
