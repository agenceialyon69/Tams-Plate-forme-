# Jobs and Automation Runtime v1

## Verdict

**PASS pour un runtime interne mono-instance; WARN pour un worker distribué.**

## Jobs

Statuts : `queued`, `running`, `success`, `warn`, `fail`, `cancelled`, `timeout`.

Chaque job conserve :

- type et input nettoyé;
- progression;
- résultat ou `lastError`;
- timeout;
- demande d'annulation;
- logs;
- timestamps.

La route HTTP répond `202` puis l'exécution commence hors de la requête. Postgres est la source persistante; un repli mémoire borné protège le mode dégradé.

## Jobs préparés

- vidéo;
- musique;
- recovery import;
- coaching long;
- Gmail sync;
- Calendar sync;
- n8n;
- Dev Agent repair;
- automations internes.

Les jobs exigeant un provider ou un approval terminent en `warn` avec `handoff_required`; ils ne simulent jamais un résultat externe.

## Automations

Dix automations de base sont créées idempotemment. Elles sont désactivées par défaut et exécutées en dry-run. Une activation ou exécution sensible passe par le Permission System.

Sans n8n, le moteur reste `internal_safe_local`. Avec `N8N_WEBHOOK_URL`, n8n reste optionnel et protégé par approval.

## Limites

- Pas de leasing distribué ni de worker multi-instance.
- Pas de cron externe créé automatiquement.
- Le cancel est coopératif.
- Les tâches média et intégrations nécessitent leurs providers réellement configurés.
