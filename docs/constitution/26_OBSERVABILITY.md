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

Middleware Express manquant (`middlewares/request-logger.ts`) :

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});
```

## Dashboard système

Page `/systeme` — doit afficher :
- Stats globales (nb tâches, décisions, mémoires)
- Derniers événements `activity`
- Statut de l'IA (disponible / fallback)
- Statut DB (connectée / erreur)
