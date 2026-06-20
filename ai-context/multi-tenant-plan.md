# Plan de migration — Isolation multi-tenant

> **Statut : différé (décision du 2026-06-20).** Mode actuel = **perso, test
> d'abord**. On bascule en multi-tenant une fois l'app validée par l'utilisateur.
> Ce document garde le concept prêt à exécuter, sans rien changer maintenant.

## Problème à résoudre
Les tables de **données produit** n'ont pas de colonne `tenantId` et les routes
ne filtrent pas par tenant :
`tasks`, `captures`, `events`, `learnings`, `decisions`, `memory`,
`energy_logs`, `evening_reviews`, `leads`, `lead_activities`, `recordings`.
→ Tant que l'app reste mono-utilisateur **avec inscription fermée**, ce n'est pas
exploitable. Mais c'est **bloquant avant d'ouvrir à plusieurs clients**.

La couche gouvernance (`users`, `tenants`, `quotas`, `audit_logs`,
`kill_switches`, `registry_entries`, `approval_requests`, `member_invitations`)
est **déjà** scopée par `tenantId` — donc le travail porte uniquement sur les
tables data ci-dessus.

## Stratégie (incrémentale, non destructive)
Faire en plusieurs PR, une table/route à la fois, chaque étape testée + CI verte.

### Étape 1 — Schéma
Pour chaque table data :
- `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS tenant_id INTEGER` (nullable d'abord).
- Backfill : `UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL` (tenant par
  défaut = celui du owner bootstrap / token maître).
- Index : `CREATE INDEX IF NOT EXISTS <t>_tenant_idx ON <t>(tenant_id)`.
- Ajouter `tenantId` au schéma Drizzle correspondant.
- Tout via `ensure-schema.ts` (idempotent, déjà en place) → migration auto au boot.

### Étape 2 — Écriture
À chaque `INSERT`, renseigner `tenantId: req.tenantId` (déjà disponible via
`requireAuthJwt`). Le token maître donne `tenantId = 1`.

### Étape 3 — Lecture / mise à jour / suppression
Ajouter `eq(table.tenantId, req.tenantId)` à **chaque** `where` (GET liste, GET
:id, PATCH, DELETE, exports, briefings/agrégations). Helper recommandé :
`scopeByTenant(req)` qui renvoie la condition, pour éviter les oublis.

### Étape 4 — Caches
Les caches module-level (`briefingCache`, `weeklyCache`, `overloadCache`) doivent
être **clés par tenant** (`Map<tenantId, …>`), sinon fuite inter-tenant.

### Étape 5 — Garde-fous
- Tests smoke étendus : créer 2 tenants, vérifier que A ne voit pas les données de B.
- Revue : `grep` des routes data pour s'assurer qu'aucun `where` n'omet le tenant.

## Points d'attention
- Le **token maître `API_AUTH_TOKEN`** = owner tenant 1. Décider s'il reste un
  super-admin cross-tenant ou s'il est restreint.
- L'**auto-inscription** : passer d'« inscription fermée » à « invitation »
  (le système d'invitations existe déjà : `member_invitations`).
- Ne **pas** renommer les colonnes existantes ; uniquement ajouter `tenant_id`.

## Définition de “terminé”
Toutes les routes data filtrent par `req.tenantId`, caches scopés, test
multi-tenant vert, et un utilisateur d'un tenant ne peut ni lire ni modifier les
données d'un autre.
