# 12 — Validation Runtime

## Healthcheck

`GET /api/healthz` — retourne `{ status: "ok" }` avec HTTP 200.
Railway surveille ce endpoint (30s timeout, restart on_failure).

Note : Le schéma OpenAPI `HealthStatus` ne contient que `status`. Ajouter `timestamp` et `version` si besoin de plus de télémétrie.

## Validation des inputs

Tous les endpoints qui reçoivent un body doivent utiliser Zod :

```typescript
const schema = z.object({ ... });
const parsed = schema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
}
```

## Error handler Express centralisé

```typescript
// artifacts/api-server/src/middlewares/error-handler.ts
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
}
```

## Fallback IA

Si `AI_GATEWAY_URL` ou `REPLIT_AI_API_KEY` absent :
- Retourner un briefing / réponse basés sur règles.
- Ne jamais crasher. Ne jamais retourner un 500 silencieux.
- Logger le fallback dans `activity` table.

## Checklist runtime

- [ ] `/api/healthz` répond 200.
- [ ] `/api/briefing` répond même sans clé IA.
- [ ] `/api/chat` répond même sans clé IA.
- [ ] Pas de route retournant une erreur non structurée.
- [ ] Error handler Express monté en dernier dans `app.ts`.
