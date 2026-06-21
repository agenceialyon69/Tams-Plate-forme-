# Non-objectifs actifs — protection du scope

> À **relire avant toute nouvelle feature** (cf. `rules.md`). Si une demande
> retombe ici, elle est **reportée ou refusée**, pas codée. Refuser n'est pas
> un manque d'intérêt : c'est de la discipline de scope.

## Refusés / reportés maintenant
1. **Multi-tenant / multi-clients** : l'isolation `tenantId` n'est pas appliquée
   dans les requêtes → l'app reste **mono-utilisateur** (inscription fermée).
   Plan prêt dans `multi-tenant-plan.md`, exécution différée. **Bloquant avant
   ouverture publique.**
2. **Inscription publique ouverte** : fermée par défaut (bootstrap 1er compte +
   code propriétaire). On ne l'ouvre pas avant le multi-tenant.
3. **Services / IA payants** : interdits par défaut (règle **free-first**, voir
   `decisions.md` ADR-008). Exception seulement si le gratuit est insuffisant,
   trop instable, ou incompatible avec une contrainte technique/sécurité
   **documentée** dans `decisions.md`.
4. **Vrai texte→vidéo IA** (Sora/Runway/Pika…) : payant → hors-scope. Voie
   retenue : images gratuites + montage FFmpeg.
5. **Refonte structurelle massive** du dépôt sans justification red-team.
6. **App native mobile** : on reste en **PWA** (installable, mobile-first).
7. **Temps réel / collaboratif** (websockets multi-utilisateurs, présence…).

## Anti-doublon & anti-sur-ingénierie (refus permanents)
- **Second système d'analytics/observabilité** pour un besoin déjà couvert.
  Une seule source : `app_events` + `trackEvent()`. On la **raffine**, on ne la
  duplique pas.
- **Outils multiples** remplissant le même rôle.
- **Abstractions prématurées** ; **dépendances nouvelles** sans bénéfice clair.
- **Docs parallèles** qui se recouvrent : on garde `ai-context/` court et
  factuel (cf. ADR-011 : pas de dossier `architecture/` ni `adr/` tant que
  `architecture.md` et `decisions.md` suffisent).
- **Fallbacks techniques** qui ajoutent de la maintenance sans bénéfice clair.
- **Features hors MVP** sans justification forte.
