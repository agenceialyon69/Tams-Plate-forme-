# TAMS — Roadmap

> Priorisées par valeur quotidienne. Une phase à la fois.

## Phase 0 — Base documentaire
- [x] Créer /docs/constitution/ (11 documents) — commit 9efdb12

## Phase 1 — Chief of Staff intelligent
- [x] Briefing Accueil généré par IA depuis les vraies données — commit 4a0204f
- [x] Remplacer le contenu hardcoded de briefing.ts par un appel IA
- [x] Le briefing doit analyser, prioriser, anticiper — pas juste afficher
- [x] Fallback gracieux basé sur règles si IA indisponible

## Phase 2 — Chat central intégré
- [x] Tool-use / function-calling : l'IA peut créer tâches, projets, contacts, décisions — commit 5254126
- [x] Injection mémoire : l'IA connaît le contexte utilisateur
- [ ] Streaming des réponses

## Phase 3 — Memory Graph réel
- [x] Edges typées entre memories (table memory_edges + enum) — commit b1d9b79
- [x] Routes API : GET graph, CRUD edges
- [ ] Visualisation du graphe côté frontend
- [ ] Auto-linking des entités

## Phase 4 — Decision OS amélioré
- [x] Confidence score analytique (IA évalue sur 4 critères) — commit eb9fa72
- [x] Lien décisions → tâches (POST /decisions/:id/tasks)
- [ ] Timeline / historique des décisions

## Phase 5 — System layer
- [x] Route audit (GET /system/audit) — commit 435da4d
- [x] Route stats (GET /system/stats)
- [x] Route export/recovery (GET /system/export)
- [ ] Work OS : vue projet, liens contacts ↔ projets
- [ ] Studio : cohérence avec le reste

## Phase 5.5 — OpenAPI spec + Codegen
- [x] OpenAPI spec mis à jour (31 paths, 42 schemas) — commit 624ca63
- [x] Codegen Orval régénéré (8 nouveaux hooks React Query + schemas Zod) — commits 519b8e1, 1a3c3ca

## Phase 6 — Mobile premium
- [ ] Safe areas, gestes, keyboard handling
- [ ] 60 FPS, fluidité
- [ ] Interactions naturelles

## Phase 7 — Optimisation générale
- [ ] Tests
- [ ] CI/CD
- [ ] Performance
- [ ] DB : créer la table memory_edges sur Railway via drizzle-kit push
- [ ] Frontend : UI pour Memory Graph visualisation, System audit/stats, Decision tasks
