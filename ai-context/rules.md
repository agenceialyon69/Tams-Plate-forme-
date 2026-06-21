# Rules — gouvernance du projet

## Principes absolus
1. Simplicité maximale — la solution la plus simple qui marche. Pas de sur-ingénierie.
2. Scope strict — toute feature non essentielle au MVP est rejetée/reportée.
3. Une action à la fois — une feature = un cycle complet.
4. Stabilité avant intelligence — pas d'optimisation/automatisation prématurée.
5. Template avant expérimentation — base propre d'abord, IA ensuite.
6. **Gratuit d'abord** — tout outil/IA doit être gratuit (voir `free-stack.md`).
   Payant = exception seulement si le gratuit est insuffisant/instable/incompatible
   avec une contrainte documentée (à inscrire dans `decisions.md`).
7. **Relire les non-objectifs actifs** (`vision.md`) avant toute feature.

## Red Team checklist (avant toute implémentation)
- Indispensable ? Peut-on la supprimer ? Existe-t-il plus simple ?
- Ajoute-t-elle de la dette ? Est-ce scalable ? Utile à un MVP réel ?
- **≥ 2 réponses négatives → refuser la feature.**

## Decision Gate (avant de coder)
1. Analyse du besoin. 2. Solution simple. 3. Solution avancée.
4. Choix final argumenté. 5. Validation.

## Execution loop
Analyse → Red Team → Decision Gate → Plan → Implémentation → Tests simples →
Commit → Push → Maj `progress.md` → Vérif stabilité → Tâche suivante.

## Checklists de gouvernance (à appliquer à chaque feature/intégration)

### Gouvernance & free-first
- La feature apporte une **valeur réelle** au MVP ou à la stabilité ?
- Appliquer **free-first** : open source / self-hosted / gratuit, sans crédits
  ni abonnement. **Refuser tout payant** si une alternative gratuite fiable
  existe. Documenter toute exception dans `decisions.md`.
- Lire `vision.md`, `progress.md`, `architecture.md`, `rules.md`,
  `non-objectifs.md` avant d'agir. Mettre à jour la doc utile après.

### Architecture & doc
- La décision mérite-t-elle une **ADR** ? Si structurante → `decisions.md`.
- Données/tables/relations changent → `schemas.md`.
- Démarrage/maintenance/récupération changent → `runbook.md`.
- Un périmètre est refusé/reporté → `non-objectifs.md`.
- Garder `ai-context/` **court, factuel, à jour** (pas de docs qui se recouvrent).

### Événements (tracking)
- Passer par **`trackEvent()`** (point central) ; ne pas dupliquer la logique.
- Helper spécialisé **seulement** pour un vrai besoin métier récurrent.
- Standard : `event`, `category`, `source`, `severity`, `importance`, `userId`,
  `tenantId`, `workspaceId`, `timestamp`, `metadata`.
- `source` ∈ {frontend, backend, copilot, agent, workflow, search, system, job}.
- `severity` ∈ {low, medium, high, critical}.

### Qualité (avant de livrer)
- Solution **la plus simple** ; pas de refactor global non justifié ; pas de
  doublon fonctionnel ; reste **Railway-ready** ; tests utiles exécutés (CI verte) ;
  doc à jour ; maintenabilité > optimisation prématurée.

### Non-objectifs (toujours refuser/reporter)
- Voir `non-objectifs.md` (hors-MVP injustifié, doublons, analytics multiples,
  abstractions/dépendances prématurées, solutions payantes évitables).

## Règle finale
Le projet doit rester **simple, stable, gratuit autant que possible,
compréhensible sans contexte externe, et récupérable rapidement** par un humain
ou une autre IA.

## Self-healing (bug détecté)
Stop → cause racine → fix minimal → test → commit/push → reprise.

## Règles code
- Lire `/ai-context/*` avant action ; le mettre à jour après.
- Ne jamais casser le code existant. Pas de refactor global sans red team.
- Une feature = un commit cohérent. Push obligatoire après chaque feature.
- Toujours documenter ; toujours maintenir `progress.md`.
- GitHub = source de vérité. Le projet doit toujours être exécutable.
- Vérifier `origin/main` avant de modifier ; si un push échoue, stopper et documenter.

## Sécurité (rappels)
- Auth par défaut sur `/api`. Rôles via `requireRole`.
- Pas de secret/token renvoyé au client. `_debug` interdit en prod.
- Avant multi-clients : isolation `tenantId` obligatoire sur toutes les tables data.

## Gouvernance IA (Phase 3)
- Versionner prompts / agents / schémas de sortie ; logger les requêtes IA.
- Mode safe pour actions risquées ; ne jamais inventer de données.
- IA gratuite d'abord (Ollama/Qwen/DeepSeek/Llama) ; gateway remplaçable sans refactor.

## Exceptions techniques documentées
- Dossiers `artifacts/kore` (front) et `artifacts/api-server` (back) **non
  renommés** vers `/frontend` `/backend` (éviter de casser le build/déploiement).
- Identifiants techniques pouvant garder un ancien nom temporairement : préfixe
  secret JWT `gandal-jwt:` (renommer casserait les sessions existantes),
  variable `API_AUTH_TOKEN`. À migrer proprement plus tard si besoin.
