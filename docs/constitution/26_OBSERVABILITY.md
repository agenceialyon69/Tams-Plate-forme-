# 26 — Observabilité

## Ce qui est en place

- Table `activity` : journal des événements système.
- `GET /api/system/audit` : derniers événements.
- `GET /api/system/stats` : statistiques globales.
- `GET /api/healthz` : healthcheck Railway.

## Événements à logger

Tous les événements importants doivent être inscrits dans `activity` :

| Événement | Priorité |
|---|---|
| Briefing généré (IA ou fallback) | Haute |
| Message chat + tool-use exécuté | Haute |
| Décision créée / analysée | Haute |
| Erreur IA (timeout, clé manquante) | Critique |
| Tâche créée / complétée | Moyenne |
| Export déclenché | Moyenne |
| Mémoire créée | Basse |

## Request Logger

Logging HTTP implémenté via `pino-http` dans `app.ts` :

```typescript
app.use(pinoHttp({
  logger,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));
```

Middleware dédié `middlewares/request-logger.ts` non nécessaire — pino-http déjà monté.

## Dashboard système

Page `/systeme` — doit afficher :
- Stats globales (nb tâches, décisions, mémoires)
- Derniers événements `activity`
- Statut de l'IA (disponible / fallback)
- Statut DB (connectée / erreur)
