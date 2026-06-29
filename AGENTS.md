# ⚠️ STOP — RÈGLES OBLIGATOIRES POUR TOUTE IA (Bolt · Replit · Claude · Cursor · Codex)

Plusieurs IA travaillent **en même temps** sur la branche unique **`main`** (liée à
Railway en auto-déploiement). Des commits/force-push répétés ont **détruit** le
travail des autres et cassé le déploiement pendant des jours. **Ce fichier est la loi.**
Lis aussi `docs/constitution/00_READ_FIRST.md`, `FREE_AI_ECOSYSTEM.md`, `AI_OS_ARCHITECTURE.md`.

---

## 🚫 INTERDICTIONS ABSOLUES (cassent tout)
1. **JAMAIS de `git push --force` / `push -f` / `--force-with-lease` sur `main`.**
   Un force-push réécrit l'historique et **efface le travail des autres + le
   garde-fou**. C'est la cause n°1 des destructions. Si ton push est rejeté →
   **`git pull --rebase`**, jamais `--force`.
2. **JAMAIS supprimer** : `.github/workflows/ci.yml`, `.github/workflows/guardian.yml`,
   `AGENTS.md`, `railway.toml`, `nixpacks.toml`, `.tams/guardian/`.
3. **JAMAIS committer des fichiers que tu n'as pas modifiés** (n'utilise pas
   `git add -A` à l'aveugle si ton dépôt est en retard → tu réécrases les correctifs).

## ✅ PROCÉDURE DE PUSH (obligatoire, à chaque fois)
```
git pull --rebase origin main        # 1. se mettre à jour AVANT (sinon on écrase)
# ... fais tes modifs ...
pnpm install --no-frozen-lockfile    # 2. dépendances
pnpm run typecheck                   # 3. DOIT passer (sinon CI rouge = pas de déploiement)
BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/tams run build
pnpm --filter @workspace/api-server run build   # 4. les 2 builds DOIVENT passer
git add <tes fichiers précis>        # 5. seulement tes fichiers
git commit -m "..."
git pull --rebase origin main && git push    # 6. rebase puis push (jamais --force)
```
La **CI** (`.github/workflows/ci.yml`) revalide tout. Railway est réglé sur
**« Wait for CI »** : un commit qui échoue à la CI **ne déploie pas** (le site
reste sur la dernière version verte). Si ta CI est **rouge → corrige**, ne contourne pas.

## 🔒 INVARIANTS — INTERDIT DE RÉVERTER (la CI échoue automatiquement sinon)
1. `railway.toml` : `[build] builder = "NIXPACKS"` + `buildCommand` + `watchPatterns = ["**"]` + `[deploy] startCommand` (NODE_ENV=production). *Sinon Railpack lance `--frozen-lockfile` → ERR_PNPM_LOCKFILE_CONFIG_MISMATCH → aucun déploiement.*
2. `nixpacks.toml` : `nixPkgs = ["nodejs_22","pnpm"]` + `pnpm install --no-frozen-lockfile`. *Pas `npm install -g pnpm` (→ "command not found").*
3. `package.json` : garder `"packageManager": "pnpm@10.33.0"`.
4. **Tailwind v4** : `@import "tailwindcss"` dans `artifacts/tams/src/index.css` + plugin `@tailwindcss/vite` dans `vite.config.ts`. **JAMAIS** `postcss.config.js`/`tailwind.config.js` v3 (→ **page blanche**).
5. `artifacts/api-server/src/app.ts` : sert le frontend **sans** `if (process.env.NODE_ENV === "production")` (→ sinon **"Cannot GET /"**).
6. `artifacts/api-server/src/index.ts` + `lib/db` : `ensureSchema()` au boot ; `lib/db/src/index.ts` ne **throw jamais** à l'import (fallback `PG*`).
7. **Endpoints liste** (`tasks/assets/decisions/memories/projects/contacts`) : renvoient un **TABLEAU brut** (`res.json(rows)`), jamais `{ data, total }` (→ "X.map is not a function" → **écran noir**).
8. `routes/index.ts` : `conversationsRouter` et `agentsRouter` montés **SANS préfixe** (double-préfixe → `/api/conversations` renvoie le HTML → page noire du Chat).
9. **Cerveau IA unique, free-first** : tout passe par `lib/ai.ts` (`aiChat`/`aiChatStream`, `fetch` pur, OpenAI-compatible, fallback Ollama→Groq→Gemini→OpenRouter). `lib/ai-router.ts` ne fait que la sélection de capacité et **délègue** à `lib/ai.ts`. **JAMAIS** le SDK `openai` (`from "openai"`/`import("openai")`) ni `api.openai.com` (→ dépendance payante + build cassé). Le Chat (`routes/conversations.ts`) branche le **Reflection Engine** (`lib/reflection.ts`) après chaque tour, en fire-and-forget. Pas de système d'agents/orchestration dupliqué : `lib/agents/` (Chat) + `lib/agents.ts` (page Agents) pensent tous deux via `lib/ai.ts`.

## 🛡️ Garde-fous automatiques
- **CI** : vérifie ces 8 invariants + build + smoke test à chaque push.
- **Guardian** (`.github/workflows/guardian.yml`) : si un invariant est cassé,
  il **restaure automatiquement** la version canonique (`.tams/guardian/`) et
  re-pousse un correctif. **Ne le supprime pas.**
- **À faire côté admin GitHub (utilisateur)** : Branch protection sur `main` →
  ☑️ require status check **CI** · ☑️ require up-to-date before merge ·
  ☑️ **Block force pushes** · ☑️ Restrict deletions. C'est ce qui rend les
  interdictions ci-dessus réellement infranchissables.

## Où ajouter quoi (architecture — voir `AI_OS_ARCHITECTURE.md`)
- Nouvelle capacité IA → un **agent** (`lib/agents/`) ou un **outil** (Tool System) ou un **moteur** (`lib/ai.ts`), derrière une interface. Jamais en dur dans l'UI.
- Free-first absolu (`FREE_AI_ECOSYSTEM.md`) : aucune dépendance payante obligatoire.
- État vivant : `docs/constitution/35_STATE.md`.
