# 35 — STATE (état vivant : fait / en cours / reste)

> **Lire avant de commencer un lot.** Mettre à jour après chaque lot.
> Source de vérité unique de l'avancement. Branche de livraison : `main`.

_Dernière mise à jour : 2026-07-02 — après PR #72, #73 et #74._

## Règles de travail

- `main` reste la source de vérité.
- Les branches temporaires servent uniquement aux PR, à la CI et aux validations contrôlées.
- Zéro payant obligatoire : voir `36_FREE_STACK.md`.
- Definition of Done : typecheck, builds, tests runtime, smoke endpoints, E2E si nécessaire, puis validation production.
- Ne jamais prétendre qu'une capacité fonctionne si elle est seulement planifiée ou non configurée.

---

## ✅ Fait et mergé

### Socle historique

- Railway débloqué et builds frontend/backend opérationnels.
- Backend principal monté : health, briefing, conversations, tasks, projects, contacts, memories, decisions, assets, studio, dashboard, notifications, system.
- Frontend `artifacts/tams` déployé avec Accueil, Chat, Agents, Travail, Vie, Studio, Système.
- AI Router free-first sans dépendance payante obligatoire.
- Studio image gratuite via Pollinations.
- Agent System backend/frontend opérationnel.

### Capability Action Bus

- Bus `/api/capabilities/execute` ajouté.
- Actions média et mémoire initiales branchées.
- Workflows utilisateur corrigés.

### Dev Agent / validation

- Dev Agent Core v1 branché.
- Validation Runner branché.
- Workflow GitHub Actions sandbox ajouté.
- CI Operator branché.
- Playwright configuré pour les pages critiques.
- Scheduler Dev Agent exposé.
- VIS, selftest, readiness, workflows, version, registry et export protégé inclus dans les contrôles.
- PR #72 mergée avec CI verte.

### Fiabilité Chat vidéo

- Le message utilisateur ne disparaît plus après erreur réseau/backend/stream.
- Les réponses Studio, Runtime et SSE sont rendues durables côté UI.
- Timeout et fallback assistant ajoutés.
- Fallback TikTok avec hook, script, shot list, captions et CTA.
- Honnêteté produit : pas de faux fichier vidéo IA annoncé.
- PR #73 mergée avec CI verte.

### Providers restants + Système

- `video.generate` produit un MP4 réel via FFmpeg slideshow.
- `search.web` branché avec DuckDuckGo gratuit et Tavily optionnel.
- `automation.workflow` branché via n8n webhook.
- `audio.music.generate` branché via Hugging Face MusicGen ou worker dédié.
- `voice.transcribe` branché via worker transcription.
- `audio.synthesize` branché via worker TTS.
- Registry mis à jour : capacités disponibles séparées des configurations optionnelles.
- `/api/system/metrics` ajouté.
- Santé système alignée avec l'UI pour éviter un faux statut IA en erreur.
- Version système corrigée : commit Git/Railway au lieu de `0.0.0`.
- Selftest corrigé : un outil en erreur ne doit plus être affiché comme PASS.
- PR #74 mergée avec CI verte.

---

## 🔧 En cours / à vérifier

1. Vérifier le redéploiement Railway après PR #74.
2. Retester l'onglet Système en production : métriques, IA, version, selftest.
3. Créer de vraies règles/workflows métier.
4. Configurer les workers optionnels uniquement si nécessaire : n8n, musique, transcription, voix, rendu vidéo avancé.
5. Tester l'import/restauration complète du système.

---

## 🗺️ Reste par pilier

- **P1 Chief of Staff** : fraîcheur du briefing et intégration vie perso.
- **P2 Chat OS** : mémoire plus riche, pièces jointes, modes avancés.
- **P3 Agent System** : autonomie plus forte, délégation et mémoire longue durée.
- **P4 Memory Graph** : relations plus utiles, pgvector mieux exploité.
- **P5 Decision OS** : Red Team décisionnelle plus profonde et suivi post-décision.
- **P6 Workspace** : agenda, CRM, projets, notes et objectifs à mieux fusionner.
- **P7 Studio** : qualité vidéo/audio réelle à améliorer avec assets produit.
- **P8 AI Router** : choix automatique par tâche, latence et fallback observables.
- **P9 Mobile Premium** : safe areas, clavier, gestes, offline, fluidité native.
- **P10 Platform OS** : observabilité avancée et recovery import.
- **P11 Personal Life OS** : santé, famille, finances, admin, carrière, apprentissage.

---

## Verdict objectif

- **Objectif V1 : validé.** TAMS possède maintenant un socle OS + Dev Agent contrôlé + providers branchés.
- **Objectif final : non terminé.** La prochaine étape est la preuve par usage réel en production.

Voir aussi : `37_IMPLEMENTATION_LEDGER_2026-07-02.md`.
