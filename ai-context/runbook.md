# Runbook — exploitation & incidents

Procédures opérationnelles. But : pouvoir déployer, diagnostiquer et réparer
**sans deviner**.

## Déploiement (Railway, service unique)
1. Merge sur `main` (CI verte obligatoire) → Railway redéploie automatiquement.
2. Build : `railway.toml` → build front (Vite) + API + `pnpm prune --prod`.
3. Variables : voir `.env.example` (toutes documentées). Minimum requis :
   `DATABASE_URL`, `API_AUTH_TOKEN` (≥16), `JWT_SECRET` (≥32), `PORT`, `BASE_PATH=/`.
4. Healthcheck : `/api/healthz` → `{status:"ok", db:"ready|connecting"}` (200).

## Vérifier la config en prod
- **Paramètres → Configuration IA & Intégrations** (UI) : état réel vert/rouge.
- API : `GET /api/integrations/status` (owner/admin) → fournisseurs détectés.

## Secrets & rotation
- `API_AUTH_TOKEN` = clé maître owner **et** dérive `JWT_SECRET` si absent.
  Le changer **invalide les sessions** et l'accès maître. Générer :
  `openssl rand -hex 32`. Préférer fixer `JWT_SECRET` séparément pour tourner
  l'un sans l'autre.
- Aucun secret n'est renvoyé au client ni loggé en clair. Ne jamais committer
  de `.env`.

## Incidents fréquents

### Login / requêtes renvoient 500 au démarrage
- Cause probable : dérive de schéma (colonne manquante) ou DB pas prête.
- Vérifier `/api/healthz` (`db`). `ensure-schema.ts` répare au boot
  (`ALTER ADD COLUMN IF NOT EXISTS`). Si une colonne manque, l'ajouter là.

### « L'assistant IA n'est pas configuré »
- Aucun fournisseur détecté. Ajouter `GEMINI_API_KEY` ou `GROQ_API_KEY` ou
  `OPENROUTER_API_KEY` (gratuits) sur Railway, redéployer. Vérifier dans
  Paramètres.

### Génération image/vidéo ou recherche web échoue
- Message « le serveur n'a pas accès à Internet » → egress réseau bloqué.
  Railway autorise le sortant par défaut ; sinon autoriser les hôtes :
  `image.pollinations.ai`, `api-inference.huggingface.co`, `openrouter.ai`,
  `api.tavily.com`, `api.search.brave.com`, `api.duckduckgo.com`.
- FFmpeg indisponible → il est installé via `nixpacks.toml` (`aptPkgs=["ffmpeg"]`);
  vérifier le build.

### 429 « Too many requests »
- Limites : global 120/min/IP, user 100/min, tenant 300/min, IA 20/min,
  image 15/min, vidéo 6/min. Voir `middlewares/rate-limit.ts`. Les limiteurs IA
  sont montés en fin de chaîne (ne débordent pas sur les autres routes).

### Verrouiller une fonctionnalité en urgence
- Kill-switch (`kill_switches`) / page Gouvernance.

## Ajouter…
- **un fournisseur IA** : nouveau provider isolé dans `lib/llm.ts` + variable
  dans `.env.example`. Aucun changement de route.
- **une intégration** : `lib/integrations/<x>.ts` (statut + dégradation propre),
  route owner/admin dans `routes/integrations.ts`, flag dans `.env.example`,
  ligne dans `/integrations/status`, assertion smoke.
- **une colonne DB** : éditer `schema/*.ts` **et** `ensure-schema.ts` (idempotent).

## Tests / qualité avant push
```
pnpm -C artifacts/api-server run typecheck && \
pnpm -C artifacts/kore run typecheck && \
pnpm -C artifacts/api-server run build && \
pnpm -C artifacts/kore run build && \
node scripts/smoke.mjs        # nécessite un Postgres + DATABASE_URL
```
La CI rejoue exactement ça. Ne jamais merger sur rouge.

## Rollback
- Revert le commit de merge sur `main` (Railway redéploie l'état précédent).
  Le schéma étant additif/idempotent, un rollback de code ne casse pas la DB.
