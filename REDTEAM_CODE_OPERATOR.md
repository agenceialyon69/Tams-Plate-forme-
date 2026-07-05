# RED TEAM — Code Operator (lecture seule) — PR agent codeur #1

## Objectif
Première brique de l'**agent codeur façon Claude Code**, free-first : donner à
Mon Agent la **compréhension d'un repo** via l'API GitHub (gratuite, réutilise
`GITHUB_TOKEN` déjà présent en prod). **LECTURE SEULE** — aucune écriture ici.

## Verdict
PASS local (typecheck + build API + smoke : 503 missing_config, 400 validation,
appels GitHub réels avec gestion d'erreur honnête). CI teste le contrat sans
dépendre d'un token. **Prochaine PR = écriture réelle** (branche → commit → PR).

## Ce qui a été fait / fichiers
| Fichier | Rôle |
|---|---|
| `lib/dev-agent-ci-operator.ts` | Export des primitives testées (`github`, `redact`, `repoName`, `split`, `githubConfigured`) |
| `lib/github-code-operator.ts` | `readFile` / `listTree` / `searchCode` (lecture seule, secrets caviardés, bornés) |
| `routes/code-operator.ts` | `GET /api/code/{file,tree,search}` |
| `routes/index.ts` | Montage du routeur |
| `lib/operator.ts` | Intent `github_code` : « explique `<fichier>` » → lecture + synthèse LLM ; « où est X » → recherche de code ; sinon plan. Détection d'intent élargie |

## Endpoints (protégés par le gate admin quand actif)
- `GET /api/code/file?repo=&path=&ref=` → contenu décodé (caviardé, borné 60k).
- `GET /api/code/tree?repo=&ref=&limit=` → arborescence (chemins).
- `GET /api/code/search?repo=&q=&limit=` → recherche de code.

## Sécurité / honnêteté (analyse adversariale)
| Point | Traitement |
|---|---|
| Fabrication de contenu | **Impossible** : lecture réelle via API GitHub ; sans token → **503 missing_config** ; erreur GitHub (401/404) remontée telle quelle |
| Fuite de secret | Contenu **caviardé** (`redact`) avant renvoi (tokens, clés d'env connues) |
| Écriture accidentelle | **Aucune écriture** dans cette PR (que des GET) |
| Réponse énorme | Fichier borné à 60k, arbre borné (limite + `truncated`) |
| Repo arbitraire | `repoName` valide le format `owner/name` ; défaut = repo TAMS |
| Accès non authentifié | Sous `/api` → soumis au gate admin (lecture réservée à l'admin) |

## Limites honnêtes
- **Lecture seule.** L'écriture (créer une branche, modifier des fichiers,
  committer, ouvrir une PR) arrive dans la **PR suivante**, derrière confirmation
  + flag `TAMS_DEV_AGENT_PR_WRITE`, jamais sur `main`, jamais de merge auto.
- La **recherche de code** GitHub peut renvoyer 422 sur certaines requêtes ou
  être limitée sur repo privé peu indexé — l'erreur est remontée honnêtement.
- Qualité d'explication = LLM gratuit (Gemini/Groq) : bon pour comprendre un
  fichier, pas un audit d'architecture complet.

## Tests
- Local : typecheck ✅, build ✅. Sans token valide → `/api/code/*` = 503 /
  400 (validation) ; avec le token (proxy factice) → appel réel → **401 remonté
  honnêtement** (preuve qu'aucun contenu n'est inventé).
- CI : `/api/code/file` sans token = 503, sans `path` = 400 ; `/api/code/tree` =
  503 ; `/api/code/search` sans token = 503, sans `q` = 400.

## Config prod
`GITHUB_TOKEN` (déjà présent) → lecture opérationnelle immédiatement. Un jeton
**fine-grained en lecture** sur le repo TAMS suffit.

## Prochaine étape
**Écriture de code réelle** : `POST /api/code/propose` → sur confirmation, crée
une branche (jamais `main`), écrit les fichiers (Contents/git trees API),
commit, ouvre une **PR** (pas de merge). Boucle : lecture → diff → PR → CI.

## Rollback
Retirer le routeur (additif, isolé) ou revert de la PR. Sans `GITHUB_TOKEN`,
les endpoints sont déjà inertes (503).
