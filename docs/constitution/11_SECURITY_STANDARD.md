# 09 — Sécurité

## Périmètre

Application single-user, sans auth réseau. Surface d'attaque limitée mais non nulle.

## Règles absolues

1. **Zéro secret dans Git.** `.env`, clés API, tokens : dans `.gitignore`, env vars Railway.
2. **Validation input.** Toute donnée externe validée par Zod avant traitement.
3. **Pas de stack trace en production.** Le error handler Express ne renvoie jamais `error.stack` en prod.
4. **CORS restreint.** Origin whitelistée en production via `ALLOWED_ORIGINS`.
5. **Rate limiting.** 20 req/min IA, 120 req/min général.
6. **Injection SQL impossible.** Drizzle ORM paramétré.
7. **Headers de sécurité.** Helmet.js installé et configuré.

## Middlewares (état actuel)

- `middlewares/rate-limit.ts` : ✓ Existe et monté (20 req/min IA, 120 req/min général).
- `middlewares/error-handler.ts` : ✓ Existe et monté, cache stack traces en production.
- `helmet` : ✓ Installé et configuré (commit `96fb610`).
- CORS : ✓ Restrictif en production via `ALLOWED_ORIGINS`.
- Request logging : pino-http monté dans app.ts.

## Variables sensibles

| Variable | Exposition autorisée |
|---|---|
| `DATABASE_URL` | Serveur uniquement |
| `REPLIT_AI_API_KEY` | Serveur uniquement |
| `AI_GATEWAY_URL` | Serveur uniquement |
| `ALLOWED_ORIGINS` | Serveur uniquement |
