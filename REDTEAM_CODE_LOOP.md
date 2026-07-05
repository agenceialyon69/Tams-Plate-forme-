# RED TEAM — Boucle autonome de l'agent codeur (assemblage final)

## Objectif
Assembler l'agent codeur « façon Claude Code », free-first : une **instruction en
langage naturel** (« modifie/ajoute/corrige … `<fichier>` ») dans Mon Agent →
lecture du fichier → le **LLM gratuit** (Gemini/Groq déjà en prod) génère le
**nouveau contenu complet** → **PROPOSITION en confirmation obligatoire**.
Jamais `main`, jamais de merge, flag requis pour exécuter.

## Verdict
PASS local (typecheck + build + routing + honnêteté sans LLM/token). CI teste le
contrat de façon déterministe. L'écriture reste **dormante** (flag off + double
confirmation).

## Ce qui a été fait / fichiers
| Fichier | Rôle |
|---|---|
| `lib/operator.ts` | `handleCodeChange()` : détecte l'instruction de modif, lit le fichier (`readFile`), fait générer le nouveau contenu au LLM, construit une **proposition** et crée une action **PENDING** (`code_propose`) → confirmation. `detectIntent` élargi (verbes de modif + chemin). |
| `.github/workflows/ci.yml` | Smoke : instruction de modif → `github_code` + `github_pr_create_confirmed` + statut déterministe |

## Flux & garde-fous
1. Instruction sans chemin de fichier → **blocked** (« indique le fichier »).
2. `GITHUB_TOKEN` absent → **blocked** (notConnected) — pas de lecture, pas d'invention.
3. LLM absent → **blocked** explicite (« je ne fabrique rien »).
4. Fichier trop gros (tronqué) → **blocked** (refus de risquer une troncature).
5. LLM renvoie vide / identique → **blocked / completed** (aucune PR inutile).
6. Sinon → **proposition** : 1 fichier (borne de sûreté), branche `tams/agent-…`,
   `requiresConfirmation=true` + `confirmationId`. Rien n'est écrit sans
   `/api/operator/confirm`, qui appelle `proposeChange` (jamais main, jamais merge,
   flag `TAMS_DEV_AGENT_PR_WRITE` requis).

## Sécurité (analyse adversariale)
| Menace | Mitigation |
|---|---|
| Écriture non voulue | **Triple barrière** : LLM propose seulement → confirmation utilisateur → flag serveur |
| Hallucination qui casse le fichier | Contenu complet exigé ; vide/identique → refus ; 1 fichier borné ; fichier tronqué refusé |
| Fabrication de code sans base | Lecture réelle d'abord ; sans token/LLM → blocked honnête |
| Fuite de secret | `redact` sur le contenu lu ; erreurs caviardées |
| Emballement multi-fichiers | **1 fichier par passe** |

## Limites honnêtes
- **Un fichier par passe.** Les changements multi-fichiers / gros refactors ne
  sont pas visés (fiabilité LLM gratuit). L'humain confirme toujours le diff via
  la PR avant tout merge.
- La qualité dépend du LLM gratuit : bon pour des modifs ciblées, pas un refactor
  d'architecture.
- Pas encore de « surveille la CI et re-corrige » automatique : la PR est créée,
  l'humain (ou une itération suivante) suit la CI.

## Tests
- Local : typecheck + build OK. Instruction de modif → `intent=github_code`,
  `capabilityId=github_pr_create_confirmed` ; avec token factice → lecture 401
  remontée honnêtement ; sans chemin → blocked.
- CI : instruction de modif → `github_code` + confirmation + statut déterministe
  (sans token/LLM → blocked).

## Config prod (pour ACTIVER l'écriture réelle)
1. `GITHUB_TOKEN` fine-grained **avec écriture** (contents + pull requests).
2. `TAMS_DEV_AGENT_PR_WRITE=true` (après validation).
3. Une clé IA gratuite (déjà présente : Gemini/Groq) pour la génération.

## Bilan agent codeur
Lecture (compréhension) ✅ · Écriture (branche/commit/PR) ✅ · Boucle NL →
proposition → confirmation → PR ✅. C'est la trajectoire « façon Claude Code »
en free-first, avec garde-fous stricts. Prochaines capacités : documents, URL, veille.

## Rollback
`TAMS_DEV_AGENT_PR_WRITE=false` (dormant) ; ou revert (additif, isolé).
