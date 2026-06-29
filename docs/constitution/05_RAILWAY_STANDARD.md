# 05 — Standard Railway

## Plateforme

Railway + Nixpacks (Node.js 22). Autodeploy depuis `main`.

## Healthcheck

`GET /api/healthz` — 30s timeout. Doit retourner `{ status: "ok" }` avec HTTP 200.

## Variables d'environnement requises

| Variable | Requis | Usage |
|---|---|---|
| `DATABASE_URL` | Oui | PostgreSQL Railway auto-provisionné |
| `PORT` | Oui | 3000 en production |
| `NODE_ENV` | — | `production` |
| `SESSION_SECRET` | Oui | Secret session (32 chars min) |
| `AI_GATEWAY_URL` | Optionnel | URL AI Gateway |
| `REPLIT_AI_API_KEY` | Optionnel | Clé IA (fallback rule-based si absent) |

## Commande de démarrage

```bash
node --enable-source-maps ./artifacts/api-server/dist/index.mjs
```

## Build Nixpacks

```toml
[phases.install]
cmds = ["npm install -g pnpm@10 && pnpm install --frozen-lockfile"]

[phases.build]
cmds = [
  "pnpm --filter @workspace/tams run build",
  "pnpm --filter @workspace/api-server run build"
]

[start]
cmd = "node --enable-source-maps ./artifacts/api-server/dist/index.mjs"
```

## Règle critique

Le serveur API utilise un bundle **esbuild CJS** — redémarrage obligatoire après ajout de routes.  
Ne jamais casser l'autodeploy en introduisant une variable d'environnement non déclarée.
