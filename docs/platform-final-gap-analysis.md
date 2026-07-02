# TAMS — Platform Final Gap Analysis

## Verdict

**WARN** avant validation CI finale. La fondation industrielle est implémentée, mais les intégrations OAuth et workers externes restent volontairement non configurées par défaut.

## Réellement connecté

- Life OS v5 : cockpit, score, Risk Radar, plan, capture preview/persist et Red Team.
- Permission System : registre d'actions, check, approval temporaire, audit des refus/autorisations.
- Job Queue interne : création non bloquante, progression, résultat, erreur, logs, annulation et repli mémoire sûr.
- Deep History : événements centralisés, timeline, détail et tendances.
- Memory Graph v2 : nœuds, relations, recherche et contexte sourcé.
- Automations : dix modèles, activation contrôlée, dry-run, jobs et logs.
- Coach : faits, suppositions, risques, arbitrages, recommandation, contre-arguments, sources, limites et timebox.
- Ops : DB, jobs, providers, intégrations, checks synthétiques et métadonnées Railway sans secret.
- UI `/vie` : cockpit, briefing, risques, agenda, emails, automations, historique, coach, mémoire et privacy.

## `missing_config`

- Gmail sans `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.
- Calendar sans `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN`.
- n8n sans `N8N_WEBHOOK_URL`.
- Workers média selon leurs variables existantes.

Aucune donnée Gmail/Calendar n'est inventée. Une configuration présente mais non vérifiée retourne `configured_unverified`, jamais `connected`.

## Partiel

- Les jobs sont mono-processus. La persistance Postgres permet la consultation, mais un worker distribué dédié reste une évolution.
- Le Memory Graph v2 exploite Postgres et reste indépendant de pgvector; la recherche vectorielle est optionnelle.
- Ops Railway expose uniquement les métadonnées injectées par Railway; il ne prétend pas lire l'API Railway sans accès.
- Le coach est déterministe et contextuel; les providers IA restent optionnels.

## Planned

- Validation OAuth réelle Gmail/Calendar et synchronisation read-only.
- Worker distribué avec leasing multi-instance.
- OpenTelemetry/Prometheus/Grafana.
- Chiffrement applicatif dédié des futurs jetons OAuth.

## Risques restants

- Le mode single-user reste la doctrine courante; une ouverture multi-utilisateur exigera un ownership strict par `user_id`.
- Les approvals sont temporaires mais doivent être associés à une identité forte lorsque `REQUIRE_AUTH=true`.
- Les actions externes ne doivent être activées qu'après tests provider réels.
