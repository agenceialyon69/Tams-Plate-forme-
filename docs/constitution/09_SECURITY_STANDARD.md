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

## Middlewares requis (actuellement manquants)

- `middlewares/rate-limit.ts` : rate limiting sur routes IA.
- `middlewares/request-logger.ts` : logging des requêtes entrant.
- `middlewares/error-handler.ts` : centraliser la gestion d'erreurs Express.

## Variables sensibles

| Variable | Exposition autorisée |
|---|---|
| `DATABASE_URL` | Serveur uniquement |
| `REPLIT_AI_API_KEY` | Serveur uniquement |
| `SESSION_SECRET` | Serveur uniquement |
| `AI_GATEWAY_URL` | Serveur uniquement |

## Headers de sécurité

Ajouter Helmet.js : `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`.
