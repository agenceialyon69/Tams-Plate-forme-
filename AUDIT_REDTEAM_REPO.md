# AUDIT RED TEAM — État réel du dépôt TAMS & plan de consolidation

> But : arrêter les rustines en boucle. Dire la vérité sur ce qui marche, ce qui
> ment, ce qui est mort, ce qui est récupérable — puis un plan fini pour rendre
> la plateforme **opérationnelle et fiable**. Priorisé par impact.

Date : 2026-07-06 · Base : `main` @ `bccfe0a`

---

## 1. Verdict honnête (sans flatter)

**On n'est PAS loin du résultat, mais la plateforme n'est pas fiable pour 3 raisons :**
1. **Elle ment encore par endroits** (Studio vidéo/musique, mémoire) → l'utilisateur
   perd confiance à chaque test.
2. **Deux systèmes en parallèle** (ancien « Agents » incapables + nouveau « Mon Agent »
   capable) → confusion permanente, code mort.
3. **Aucune protection active en prod** (readiness = FAIL) → la plateforme et l'agent
   codeur sont ouverts à quiconque a l'URL.

Le socle réel est bon (recherche web, lire-URL, documents, agent codeur→PR, vraie
vidéo MP4, capacités honnêtes dans Mon Agent). Il faut **finir et fiabiliser**, pas
tout refaire.

---

## 2. Cartographie des branches (64 branches distantes)

### 2A. Déjà mergées (mon travail récent) → **SUPPRIMER** (~13)
`feat/code-operator-read`, `feat/code-operator-write`, `feat/code-operator-loop`,
`feat/documents-analyze`, `feat/web-read`, `feat/personal-admin-access-gate`,
`feat/telegram-sheet-capture`, `fix/gate-config-fallbacks`, `fix/front-video-real`,
`fix/front-surface-capable-agent`, `hotfix-video-honesty-107`,
`hotfix/minimal-capabilities-video-honesty`, `hotfix/studio-honesty-agent-capabilities`,
`redteam/personal-access-gate`.
→ Contenu 100 % dans `main`. Suppression sans risque.

### 2B. Ancienne direction MULTI-TENANT / SaaS → **ARCHIVER puis SUPPRIMER, JAMAIS MERGER** (~25)
Le gros cluster « 111-126 commits d'avance ». Ses commits : *GANDAL platform
transformation*, *owner-signup*, *user invitation & authentication flows*,
*AI quotas / cost guardrails*, *multi-tenant plan*, *closed signup*, *audit logs*…
`chore/ai-context`, `chore/branding-tams`, `chore/ci-stability`,
`chore/honest-dashboard-signals`, `chore/remove-dead-auth-mw`, `chore/untrack-dist`,
`docs/multi-tenant-plan`, `docs/root-readme`, `feat/ai-copilot`, `feat/owner-signup`,
`feat/honest-healthz`, `feat/onboarding-status`, `fix/personal-hardening`,
`fix/schema-drift-migration`, `fix/login-token-access`, `test/strengthen-smoke`,
`fix/csp-fonts`, `fix/robust-frontend-serving`, `fix/slim-image`, `fix/railway-build`,
`sync-orchestrator`, `automation-setup`, `debug/asset-inventory`, `debug/db-status`,
`railway/code-change-*` (4).
> ⚠️ **Contredit la règle absolue « NO multi-tenant / NO payments/quotas ».**
> À NE PAS réintégrer. Quelques correctifs *fiabilité* isolés y dorment (voir 4B) —
> à **cherry-pick** seulement si vérifiés, pas à merger en bloc.

### 2C. Expériences remplacées (studio / dev-agent / rescue) → **SUPPRIMER** (~20)
`assistant/*` (6), `codex/*` (5), `tams-final-rescue`, `tams-dev-runtime-v1`,
`codex-backup-before-final-rescue`, `tams-dev`, `integration/providers-v1`,
`gpu-workers-v1`, `prod-diagnostics-v1`, `studio-free-v3`, `studio-operational-v1`,
`studio-selftest-fix`, `fix/studio-real-workflows-v2`, `fix/studio-operational-rescue`,
`fix/chat-video-reliability`, `feat/dev-agent-pro-v5`, `feat/life-os-v5-foundation`,
`feat/recovery-workflows-lifeos-v1`, `feat/platform-life-os-final-v1`,
`backup/bolt-studio-release-work`, `docs/constitution-update-2026-07-02`,
`redteam/*` (autres).
→ Leur contenu utile est déjà dans `main` sous une meilleure forme.

### 2D. À VÉRIFIER pour récupération (travail unique, aligné) → **inspecter avant décision** (~4)
| Branche | Contenu unique | Décision proposée |
|---|---|---|
| `claude/tams-resume-pr95-check-36ldxm` | `feat(operator): recherche web sourcée & fiable dans Mon Agent` | **Récupérer** si pas déjà dans main (améliore l'opérateur) |
| `studio-media-editor` | éditeur média Studio (5 commits) | Inspecter : garder si ça ajoute un vrai montage |
| `feat/tams-can-do-panel` | panneau « ce que je peux faire » (front) | Probablement remplacé par Mon Agent → vérifier puis supprimer |
| `ui-single-operator` | UI opérateur unique | Vérifier vs Mon Agent actuel |

### 2E. PR ouvertes obsolètes → **FERMER** : #81 (`fix/operationalize-existing-platform-v1`), #108 (`hotfix-video-honesty-107`, brouillon).

---

## 3. Code mort / doublons dans `main` (à supprimer)

| Élément | Problème | Action |
|---|---|---|
| `lib/agents.ts` (hérité, 28 Ko) + `routes/agents.ts` + page `/agents` | Système d'agents « incapables » en doublon du vrai `lib/agents/*` (Mon Agent) | **Retirer** l'ancien système et la page, ou la fusionner dans Mon Agent |
| `lib/studio/studio-orchestrator.ts` | Hardcode `requires_local_gpu` / `PLANNED` pour musique alors que HF MusicGen marche → **mensonge** | Brancher le vrai générateur ou retirer la surface |
| `routes/studio-video.ts` (ligne ~312) | Refuse « vraie vidéo » alors que le MP4 diaporama existe → **mensonge** (le même bug que le Chat, autre page) | Router vers `video.generate` réel |
| `capability-actions.ts` `memory.query` | `safe-memory-placeholder` : « mémoire actionnable » mais ne requête rien | Brancher pgvector réel **ou** marquer honnêtement « à venir » |
| `chat.tsx` `durableLocalMessages` | Nom « durable » mais **jamais** sauvegardé (localStorage absent) → messages qui disparaissent | Persister réellement |

**~200 marqueurs** `pas encore / non branché / requires_local_gpu / placeholder / TODO`
dans le code source : à traiter par la vague « Vérité » (§5, P1).

---

## 4. Fiabilité & sécurité (état réel constaté sur captures + code)

### 4A. Bloquant
- **Aucune auth active en prod** (`readiness: personal_access = FAIL`). Le code du gate
  est livré (PR #96/98/100) mais **pas activé** côté Railway → **P0 humain**.
- `github_code_edit = WARN` (« Contents API non branchée ») : l'agent codeur écrit via
  l'API git trees (OK) mais le check readiness est à réaligner.

### 4B. À vérifier (correctifs fiabilité qui dorment sur vieilles branches)
Boot résilient / anti-crash-loop / DB resilience / healthcheck : présents dans le
cluster 2B (`fix/no-crash-loop`, `fix/db-connection-resilient`,
`fix/healthcheck-listen-first`, `fix/deploy-robustness`). **Vérifier si `main` les a
déjà** ; sinon **cherry-pick uniquement le correctif**, sans le reste multi-tenant.

---

## 5. Plan de consolidation (fini, séquencé — remplace les rustines)

> ~5 chantiers substantiels au lieu de micro-corrections en boucle.
> Chaque chantier = 1 PR verte, revue, mergée.

- **P0 — Sécurité (humain + code)**
  - TOI : activer le gate sur Railway (`TAMS_ADMIN_EMAIL` + hash mot de passe). Procédure fournie séparément.
  - MOI : vérifier que le gate protège bien `operator`, `code-operator`, exports.

- **P1 — Vérité (0 mensonge)** *(1 PR)*
  - Studio vidéo → vrai MP4 (comme le Chat). Musique → HF réel (fin de `requires_local_gpu`).
  - Mémoire `memory.query` → vraie requête pgvector, sinon retirée du « actionnable ».
  - Balayage des surfaces qui affichent « non branché » à tort.

- **P2 — UN seul chat/agent fiable** *(1 PR, le cœur de la frustration)*
  - Retirer le système d'agents hérité + page « Agents » incapables (ou fusion dans Mon Agent).
  - Chat = **vrai chat** : mémoire persistante (fin des messages qui disparaissent)
    + pièces jointes (images **+ documents** via l'endpoint existant).

- **P3 — Nettoyage dépôt** *(action + confirmation)*
  - Supprimer les branches 2A + 2B + 2C (~58). Fermer PR #81/#108.
  - Récupérer 2D si utile. Retirer le code mort (§3).

- **P4 — Fiabilité & doc** *(1 PR)*
  - Vérifier boot Railway / DB persistence / healthz ; cherry-pick 4B si besoin.
  - `RUNBOOK.md` unique : variables Railway, état de chaque capacité, actions humaines.

---

## 6. Ce que j'attends de toi (pour ne pas bloquer)
1. **Feu vert pour supprimer les ~58 branches obsolètes** (2A+2B+2C) — action externe, je confirme avant.
2. **Activer le gate Railway** (P0) — je te donne les 3 lignes exactes.
3. L'ordre de traitement si tu veux dévier de P1 → P2 → P3 → P4.
