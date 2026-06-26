# TAMS — Roadmap

> Priorisées par valeur quotidienne. Une phase à la fois.

## Phase 0 — Base documentaire
- [x] Créer /docs/constitution/ (11 documents) — commit 9efdb12

## Phase 1 — Chief of Staff intelligent
- [x] Briefing Accueil généré par IA depuis les vraies données (tâches, projets, contacts, décisions) — commit 4a0204f
- [x] Remplacer le contenu hardcoded de briefing.ts par un appel IA
- [x] Le briefing doit analyser, prioriser, anticiper — pas juste afficher
- [x] Fallback gracieux basé sur règles si IA indisponible

## Phase 2 — Chat central intégré
- [ ] Tool-use / function-calling : l'IA peut créer tâches, projets, contacts, décisions
- [ ] Injection mémoire : l'IA connaît le contexte utilisateur
- [ ] Streaming des réponses

## Phase 3 — Memory Graph réel
- [ ] Edges typées entre memories (pas juste jsonb plat)
- [ ] Visualisation du graphe
- [ ] Auto-linking des entités

## Phase 4 — Decision OS amélioré
- [ ] Confidence score analytique (pas aléatoire)
- [ ] Lien décisions → tâches (turn decision into action items)
- [ ] Timeline / historique des décisions

## Phase 5 — Cohérence Work OS / Studio / System
- [ ] Work OS : vue projet, liens contacts ↔ projets
- [ ] Studio : cohérence avec le reste
- [ ] System : audit, recovery, configuration

## Phase 6 — Mobile premium
- [ ] Safe areas, gestes, keyboard handling
- [ ] 60 FPS, fluidité
- [ ] Interactions naturelles

## Phase 7 — Optimisation générale
- [ ] Tests
- [ ] CI/CD
- [ ] Performance
