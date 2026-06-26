# 09 — Sécurité

## Périmètre

Application single-user, sans auth réseau (Replit sandbox). Surface d'attaque limitée mais non nulle.

## Règles absolues

1. **Zéro secret dans Git.** `.env`, clés API, tokens : dans `.gitignore`, dans Railway env vars.
2. **Validation input.** Toute donnée externe validée par Zod avant traitement.
3. **Pas de stack trace en production.** Le error handler Express ne renvoie jamais `error.stack` en prod.
4. **CORS restreint.** Origin whitelistée en production, pas `*`.
5. **Rate limiting.** Middleware Express sur `/api/chat` et `/api/briefing` (coût IA).
6. **Injection SQL impossible.** Drizzle ORM paramétré — jamais de requête SQL concaténée.
7. **XSS.** Jamais `dangerouslySetInnerHTML` sans sanitisation.
8. **Pas de secrets en client-side.** `REPLIT_AI_API_KEY` côté serveur uniquement.

## Middlewares (état actuel)

- `middlewares/rate-limit.ts` : ✓ Existe et monté (20 req/min IA, 120 req/min général).
- `middlewares/error-handler.ts` : ✓ Existe et monté, cache stack traces en production.
- `middlewares/request-logger.ts` : Manquant — logging HTTP via pino-http dans app.ts.
- `helmet` : Non installé — headers de sécurité manquants.

## Variables sensibles

| Variable | Exposition autorisée |
|---|---|
| `DATABASE_URL` | Serveur uniquement |
| `REPLIT_AI_API_KEY` | Serveur uniquement |
| `SESSION_SECRET` | Serveur uniquement |
| `AI_GATEWAY_URL` | Serveur uniquement |

## Headers de sécurité

Ajouter Helmet.js : `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`.
