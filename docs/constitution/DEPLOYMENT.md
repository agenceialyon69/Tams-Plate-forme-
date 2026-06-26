# TAMS — Déploiement

> Le projet doit rester déployable à tout moment.

## Stack de déploiement

- **Plateforme** : Railway
- **Build** : Nixpacks (Node.js 22)
- **Healthcheck** : `GET /api/healthz` (30s timeout)
- **Restart** : on_failure, max 5 retries

## Configuration Nixpacks (`nixpacks.toml`)

```toml
[phases.setup]
nixPkgs = ["nodejs_22"]

[phases.install]
cmds = ["npm install -g pnpm@10 && pnpm install --frozen-lockfile"]

[phases.build]
cmds = [
  "BASE_PATH=/ PORT=3000 NODE_ENV=production pnpm --filter @workspace/tams run build",
  "pnpm --filter @workspace/api-server run build"
]

[start]
cmd = "node --enable-source-maps ./artifacts/api-server/dist/index.mjs"
```

## Variables d'environnement

| Var | Requis | Purpose |
|---|---|---|
| `DATABASE_URL` | Oui | PostgreSQL (Railway auto-provisionne) |
| `SESSION_SECRET` | Oui | Session secret (non utilisé actuellement) |
| `AI_GATEWAY_URL` | Optionnel | URL du gateway IA |
| `REPLIT_AI_API_KEY` | Optionnel | Clé API IA |
| `PORT` | Oui | Port serveur (3000 en prod) |
| `NODE_ENV` | — | production/development |

## Règles

- Conserver l'autodeploy Railway.
- Ne jamais casser le déploiement en ajoutant une fonctionnalité.
- Vérifier build, healthcheck, variables et scripts de démarrage.
- Le serveur API utilise un bundle esbuild — redémarrage requis après ajout de routes.

## Build local

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/tams run build
pnpm --filter @workspace/api-server run build
node ./artifacts/api-server/dist/index.mjs
```
