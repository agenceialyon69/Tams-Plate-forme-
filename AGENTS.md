# ⚠️ À LIRE AVANT TOUT COMMIT (Bolt · Replit · Claude · humains)

Plusieurs IA travaillent sur **`main`** (branche unique, liée à Railway).
Pour que le déploiement reste **toujours vert**, respecte ces règles.

## Règle d'or
**Avant de committer : `git pull origin main` (ou rebase).** La plupart des
casses viennent de commits faits sur un dépôt périmé qui ÉCRASENT les correctifs
des autres. Ne committe jamais des fichiers que tu n'as pas modifiés.

## La CI te protège
`.github/workflows/ci.yml` build + teste l'app à chaque push. Railway est réglé
pour **ne déployer que si la CI est verte** → un commit cassé ne casse pas le site.
Si ta CI est rouge, **corrige avant de continuer** (ne force rien).

## INVARIANTS DE DÉPLOIEMENT — NE PAS RÉVERTER

1. **`railway.toml`** — doit garder `[build] builder = "NIXPACKS"`,
   `buildCommand`, `watchPatterns = ["**"]`, et `[deploy] startCommand`.
   Sans ça : Railpack lance `--frozen-lockfile` → `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.

2. **`nixpacks.toml`** — `nixPkgs = ["nodejs_22", "pnpm"]` + install
   `pnpm install --no-frozen-lockfile`. (`npm install -g pnpm` → "command not found".)

3. **`package.json`** — garder `"packageManager": "pnpm@10.33.0"`.

4. **`artifacts/api-server/src/app.ts`** — sert le frontend **sans** condition
   `NODE_ENV === "production"` (sinon `Cannot GET /` en prod).

5. **`artifacts/api-server/src/index.ts` + `lib/db`** — `ensureSchema()` au boot
   (auto-création des tables) ; `lib/db` ne doit **jamais throw** à l'import
   (fallback `PG*`), sinon crash-loop.

6. **Endpoints liste** (`/api/tasks`, `/assets`, `/decisions`, `/memories`,
   `/projects`, `/contacts`) — renvoient un **tableau brut** (pas `{data,total}`),
   conforme au contrat OpenAPI. Sinon le frontend plante (`X.map is not a function`).

7. **`routes/index.ts`** — `conversationsRouter` et `agentsRouter` montés **sans
   préfixe** (ils définissent déjà `/conversations` et `/agents`).

## Stack (rappel)
- 100 % gratuit (Ollama/Groq/Gemini/OpenRouter free, Pollinations, FFmpeg…).
- pnpm monorepo, Node 22, Tailwind v4 via `@tailwindcss/postcss` + `autoprefixer`.
- Détail vivant : `docs/constitution/35_STATE.md`.
