# RED TEAM — Code Operator (ÉCRITURE) — agent codeur brique #2

## Objectif
Donner à Mon Agent la capacité d'**écrire du code pour de vrai** (façon Claude
Code, free-first) : créer une **branche dédiée**, y committer des fichiers, et
ouvrir une **PR** — via l'API GitHub gratuite. **Jamais `main`, jamais de merge.**

## Verdict
PASS local (typecheck + build + smoke des 4 garde-fous). CI teste les garde-fous
de façon déterministe (sans token). **Dormant** tant que `TAMS_DEV_AGENT_PR_WRITE`
n'est pas activé : aucun risque en prod avant validation.

## Ce qui a été fait / fichiers
| Fichier | Rôle |
|---|---|
| `lib/github-code-operator.ts` | `proposeChange()` : git trees (blobs→tree→commit) → nouvelle branche → PR (réutilise `createPullRequest`). Classes `WriteFlagDisabled` / `MissingGithubConfig` |
| `routes/code-operator.ts` | `POST /api/code/propose` + mapping d'erreurs (400/403/503/502) |
| `lib/operator.ts` | Intent `github_code` avec `params.propose` → **confirmation obligatoire** (store PENDING) ; `confirmAction` exécute `code_propose` |
| `.github/workflows/ci.yml` | Smoke garde-fous (main→400, flag off→403, sans token→503) |

## Contrat & garde-fous (ordre pensé pour être testable)
`POST /api/code/propose { repo?, branch, files:[{path,content}], commitMessage, prTitle, prBody? }`
1. **Validation (400)** : `branch` requise ; **jamais `main`/`master`** ; nom de
   branche sûr (pas de `..`, pas de `/` initial) ; `files` non vide, chaque
   entrée `{path, content}`.
2. **Flag (403)** : exige `TAMS_DEV_AGENT_PR_WRITE=true` (sinon `WRITE_DISABLED`).
3. **Token (503)** : exige `GITHUB_TOKEN` (sinon `GITHUB_NOT_CONFIGURED`).
4. Refuse si `branch == branche par défaut` du repo.
5. **Jamais de merge.** `createPullRequest` ré-applique le flag + la protection
   du head. Erreurs GitHub **caviardées** et remontées (502), jamais simulées.

## Confirmation obligatoire (Mon Agent)
`POST /api/operator/chat { message, params:{ propose:{ branch, files, commitMessage, prTitle, prBody } } }`
→ crée une action **PENDING** + `confirmationId`, `requiresConfirmation=true`.
Rien n'est écrit sans `POST /api/operator/confirm { id }`. `/cancel` annule.
Le message avertit si le flag d'écriture est off.

## Sécurité (analyse adversariale)
| Menace | Mitigation |
|---|---|
| Écriture sur `main` | Refusée (400) ici **et** dans `createPullRequest` |
| Merge auto | Jamais de merge (création de PR uniquement) |
| Écriture sans autorisation | Double barrière : flag serveur (403) **+** confirmation utilisateur (PENDING) |
| Fuite de secret dans une erreur | `redact` sur toutes les réponses GitHub |
| Injection de chemin | `path` nettoyé, nom de branche validé |
| Activation par erreur | Dormant tant que `TAMS_DEV_AGENT_PR_WRITE≠true` |

## Tests
- Local : `branch=main`→400 · `files` vide→400 · flag off→**403 WRITE_DISABLED**
  · flag on + sans token→**503** · flag on + token factice→**502 (GitHub 401
  remonté)**. typecheck + build OK.
- CI : main→400, branche valide (flag off)→403, (flag on, sans token)→503.

## Config prod (utilisateur) — action requise pour ACTIVER
1. `GITHUB_TOKEN` fine-grained **avec droit d'écriture (contents + pull requests)**
   sur le repo TAMS (le token lecture actuel ne suffit pas pour écrire).
2. `TAMS_DEV_AGENT_PR_WRITE=true` **seulement après** avoir vérifié le
   comportement (dormant par défaut = sûr).

## Prochaine étape
**Boucle autonome** : « corrige/ajoute X » → lecture des fichiers concernés →
le LLM gratuit génère le diff → `propose` (confirmation) → PR → surveille la CI →
propose une correction si rouge. C'est l'assemblage final « façon Claude Code ».

## Rollback
`TAMS_DEV_AGENT_PR_WRITE=false` (dormant immédiat) ou revert de la PR (additif).
