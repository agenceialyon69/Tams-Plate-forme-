# 37 — Implementation Ledger 2026-07-02

> Registre factuel du lot Dev Agent + fiabilité Chat + providers.
> Objectif : aligner la Constitution avec ce qui est réellement construit, validé et mergé sur `main`.

## Verdict Red Team

**Objectif V1 validé : OUI, avec réserves.**

TAMS dispose maintenant d'un socle opérationnel beaucoup plus proche d'un **AI Operating System personnel + Dev Agent contrôlé** : validation CI, Action Bus, VIS, providers média/recherche/automation, Chat robuste, intégration GitHub/Railway.

**Objectif global final : NON terminé.**

Les briques majeures sont branchées, mais il reste des limites réelles : workflows métier à créer, workers audio/voix/n8n optionnels à configurer pour les capacités avancées, récupération/import complet à tester, et validation production Railway après chaque merge.

## Lots construits et mergés

### PR #65 — Workflows utilisateur
- Correction des workflows utilisateur.
- Routes workflows montées.
- Base pour automatisation interne.

### PR #66 — Capability Action Bus
- Ajout du bus `/api/capabilities/execute`.
- Fondation pour déclencher des capacités depuis l'UI et les agents.

### PR #67 — Memory capability action
- Connexion initiale de la capacité mémoire.
- Début d'un pont entre Action Bus et Memory Graph.

### PR #68 — Media actions
- Connexion des actions média.
- Préparation des capacités image/vidéo/audio côté Action Bus.

### PR #69 — Dev Agent Core v1
- Ajout de `dev.agent.core`.
- Mode analyse/preview.
- Permission layer de base : chemins sensibles bloqués.
- Plan de validation canonique : install, typecheck, builds, runtime scripts, smoke endpoints.
- Dev Agent exposé sans écriture directe dangereuse.

### PR #70 — Dev Agent Validation Runner v1
- Workflow GitHub Actions sandbox `dev-agent-sandbox.yml`.
- Validation Runner avec état consultable.
- Capacité `dev.agent.validation`.
- Tests runtime/scénarios branchés dans le pipeline.

### PR #71 — Dev Agent CI Operator v1
- Introduction de l'opérateur CI.
- Playwright configuré.
- E2E navigateur pour pages critiques.
- Base pour lecture CI/runs/jobs/logs et validation GitHub.

### PR #72 — Dev Agent GitHub operator complet
- Endpoints CI réels : dispatch, runs, jobs, logs, relance ciblée, PR, repair-loop.
- Scheduler Dev Agent branché.
- Journaux CI nettoyés avant affichage.
- Repair loop bornée.
- Création de PR refusée si branche source dangereuse.
- Action Bus : Core / Validation / CI / Scheduler.
- Smoke CI étendu à Dev Agent, Scheduler, VIS, selftest, export protégé et registry.
- CI run 348 verte.

### PR #73 — Chat video reliability
- Bug critique corrigé : la question utilisateur ne disparaît plus après un échec réseau/backend/stream.
- Message utilisateur persisté localement avant tout appel réseau.
- Réponses Studio, Runtime et SSE rendues durables.
- Refetch serveur vide empêché d'effacer le tour actif.
- Timeout de 45 secondes.
- Réponse assistant claire en cas d'échec.
- Fallback TikTok : hook, script, shot list, captions, CTA.
- Honnêteté produit : ne prétend pas générer un fichier vidéo IA si aucun fichier réel n'est produit.
- CI run 358 verte.

### PR #74 — Remaining provider bridges v1
- `video.generate` branché avec génération MP4 réelle via FFmpeg slideshow.
- `search.web` branché avec DuckDuckGo gratuit + Tavily optionnel.
- `automation.workflow` branché avec n8n webhook.
- `audio.music.generate` branché avec Hugging Face MusicGen ou worker dédié.
- `voice.transcribe` branché avec worker Whisper/STT.
- `audio.synthesize` branché avec worker Piper/TTS/Edge TTS.
- Registry mis à jour : capacités disponibles, providers opérationnels séparés des configurations optionnelles.
- Corrections système après captures utilisateur :
  - `/api/system/metrics` ajouté.
  - `healthz/detailed` expose `checks.ai` pour éviter le faux statut IA en erreur.
  - version système = commit Railway/Git au lieu de `0.0.0`.
  - selftest ne marque plus `list_tasks` en PASS si le détail contient une erreur réelle.
- CI run 362 verte : build, typecheck, runtime tests, smoke providers, E2E navigateur.

## Routes et surfaces opérationnelles ajoutées ou renforcées

### Dev Agent
- `GET /api/dev-agent/status`
- `POST /api/dev-agent/core`
- `GET /api/dev-agent/validation/status`
- `GET /api/dev-agent/ci/status`
- `POST /api/dev-agent/ci/dispatch`
- `GET /api/dev-agent/ci/runs`
- `GET /api/dev-agent/ci/runs/:runId/jobs`
- `GET /api/dev-agent/ci/jobs/:jobId/logs`
- `POST /api/dev-agent/ci/runs/:runId/rerun-failed`
- `POST /api/dev-agent/ci/pr`
- `POST /api/dev-agent/ci/repair-loop`
- `GET /api/dev-agent/scheduler/status`

### VIS / Système
- `GET /api/system/validate`
- `GET /api/system/selftest`
- `GET /api/system/readiness`
- `GET /api/system/metrics`
- `GET /api/system/usage`
- `GET /api/version`
- `GET /api/registry/status`
- `GET /api/registry/capabilities`
- `GET /api/registry/providers`

### Capability Action Bus
- `POST /api/capabilities/execute`
- Capacités clés : Dev Agent, Studio, image, vidéo, musique, transcription, voix, automation, recherche web.

## Ce qui est validé par CI

- Typecheck.
- Build frontend `@workspace/tams`.
- Build API `@workspace/api-server`.
- Tests du Development Runtime.
- Scénario réel Development Runtime.
- Mission2 A/B/C/D.
- Smoke endpoints.
- Smoke provider bridges.
- E2E navigateur Playwright.

## Ce qui n'est pas encore un objectif final validé

- Les workflows métier n8n ne sont pas créés tant que le webhook n8n n'est pas configuré.
- MusicGen local GPU n'est pas exécuté sur Railway ; seul Hugging Face ou worker externe est réaliste.
- Whisper/Piper nécessitent workers externes ou locaux.
- Remotion reste optionnel ; le chemin réel actuel est FFmpeg.
- Recovery import/restauration complète reste à tester.
- Le Personal Life OS est une direction constitutionnelle, pas encore un système complet.

## Règle pour les prochains agents

Ne pas reconstruire ce qui est déjà branché. Les prochaines missions doivent partir de ce registre et traiter uniquement : production Railway, usage réel, erreurs observées, UX, workflows métier et validation de bout en bout.


## PR #78 — Life OS final platform v1 (ouverte, CI verte)

- Permission System : registre, check, approval temporaire et audit.
- Job Queue : statuts, progression, logs, retry-ready, timeout/cancel, résultats et fallback mémoire.
- Deep History : événements, timeline, détails et tendances.
- Memory Graph v2 : nœuds, relations, recherche et contexte sourcé.
- Gmail/Calendar : lecture privacy-first, `missing_config` sans données simulées.
- Automations : dix modèles, dry-run, logs et jobs.
- Coach final : faits, suppositions, risques, arbitrages, recommandation, sources et limites.
- Ops : DB, jobs, providers, intégrations, checks synthétiques et contexte Railway sans secret.
- UX `/vie` : dix sections, mobile, loading/error/empty/missing_config.
- CI run 373 : builds, typecheck, Runtime, Mission 2, 15 scénarios, smoke API et Playwright PASS.

Statut : PR non mergée lors de cette écriture. Production non revendiquée.
