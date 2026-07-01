# Railway Security Notes

## État observé

Railway/Nixpacks construit TAMS avec Node 22, pnpm et FFmpeg. Le build et le healthcheck `/api/healthz` ont été observés comme réussis.

Les avertissements `SecretsUsedInArgOrEnv` proviennent du Dockerfile généré par Nixpacks lorsque Railway matérialise ses variables dans l'image de build. Aucune valeur secrète n'est copiée dans le dépôt, le frontend ou les réponses API.

## Mitigations appliquées

- Les clés sont lues uniquement côté serveur via `process.env`.
- Le frontend n'utilise aucune variable sensible.
- `/api/system/readiness` expose uniquement des noms de providers et des états `configured` / `missing_config`, jamais les valeurs.
- `OPENROUTE_API_KEY` est accepté comme alias Railway de `OPENROUTER_API_KEY`.
- `TAMS_DEV_RUNTIME_ENABLED` reste désactivé par défaut.
- Les actions runtime dangereuses restent désactivées en dur.
- Les commandes de build ne référencent aucun secret.

## Avertissements Nixpacks

`SecretsUsedInArgOrEnv` ne peut pas être entièrement supprimé depuis le code applicatif si Nixpacks génère les instructions `ARG` / `ENV`. Le risque résiduel est que des secrets soient disponibles dans l'environnement de build Railway. Ils ne sont pas publiés par TAMS et ne doivent jamais être utilisés par le build frontend.

`UndefinedVar: $NIXPACKS_PATH` provient également du Dockerfile généré. Le fichier `nixpacks.toml` du dépôt ne référence pas cette variable. La mitigation sûre est de conserver Nixpacks à jour. Si ces avertissements doivent disparaître complètement, utiliser un Dockerfile multi-stage minimal et des secrets montés uniquement au runtime, après validation dans une PR dédiée.

## Configuration Railway recommandée

Variables runtime : `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `API_AUTH_TOKEN`, clés providers nécessaires. Définir `TAMS_DEV_RUNTIME_ENABLED=false`.

`BASE_PATH=/` sert uniquement au build frontend et n'est pas secret. `BASE_PUBLIC_URL` n'est actuellement pas requis par le code. Ne pas ajouter de secret préfixé `VITE_`.
