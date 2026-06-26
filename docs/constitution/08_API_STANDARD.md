# 08 — Standard API

## Base

REST sur `/api`. Express 5. Tous les handlers sont `async`. Erreurs : `next(err)` ou réponse structurée.

## Convention de réponse

```json
// Succès
{ "data": <payload> }

// Erreur
{ "error": "message", "details": <optional> }
```

## Routes existantes (12 routeurs)

| Préfixe | Module |
|---|---|
| `/api/briefing` | Chief of Staff |
| `/api/chat` | Chat OS |
| `/api/tasks` | Work OS |
| `/api/projects` | Work OS |
| `/api/contacts` | Work OS |
| `/api/memories` | Memory Graph |
| `/api/decisions` | Decision OS |
| `/api/assets` | Studio |
| `/api/activity` | Audit |
| `/api/system` | Système |
| `/api/healthz` | Health |
| `/api/memory-edges` | Memory Graph edges |

## Codegen

Source de vérité : `lib/api-spec/openapi.yaml`.
Génération : `pnpm --filter @workspace/api-spec run codegen`.
Output : hooks React Query dans `lib/api-client-react/src/generated/` + schemas Zod dans `lib/api-zod/`.

Règle : **ne jamais écrire des hooks à la main** si le codegen peut les générer.

## Règles impératives

- Toujours valider les inputs avec Zod avant de toucher la DB.
- Toujours retourner un HTTP code approprié (200, 201, 400, 404, 500).
- Toujours passer les erreurs à `next(err)` dans Express 5.
- Ne jamais exposer des stack traces en production.
- Ne jamais faire de requêtes N+1 sans pagination.
