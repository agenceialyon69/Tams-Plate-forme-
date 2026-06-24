# Simplification Mono-Utilisateur - Chemin de Retour Multi-Tenant

## État Actuel (2026-06-24)

TAMS est maintenant configuré en mode **mono-utilisateur personnel**. Le multi-tenant existe dans l'infrastructure mais est "soft-disabled" - un seul tenant par défaut ("Personal", id=1) est utilisé.

## Ce qui a été simplifié

### Schéma de base de données
- **Tenants table** : Toujours présente mais un seul enregistrement (id=1, "Personal")
- **Foreign keys tenant_id** : Conservées dans toutes les tables, pointent vers tenant id=1
- **RLS** : Non activée (toutes les données appartiennent au même utilisateur)

### Middleware et Auth
- **auth-jwt.ts** : `tenantId` extrait du JWT mais toujours = 1
- **rate-limit.ts** : `rateLimitByTenant()` existe mais tous les tenants partagent le même namespace
- **quotas.ts** : Table `tenant_quotas` existe, quotas soft (pas de blocage dur)

## Tables Multi-Tenant (conservées mais mono-utilisateur)

| Table | Utilisation actuelle |
|-------|---------------------|
| `tenants` | 1 ligne : Personal |
| `tenant_quotas` | 1 ligne : quotas par défaut |
| `users` | 1 admin + invités éventuels |
| `sessions` | Multi-device pour le même compte |
| `member_invitations` | Inutilisé (pas d'équipe) |
| `approval_requests` | Workflow solo |

## Code à conserver (ne pas supprimer)

1. **Migrations SQL** (`supabase/migrations/`) - Toutes les migrations d'origine
2. **Schémas Drizzle** (`lib/db/src/schema/`) - Structure complète
3. **Middleware tenant** - Ne pas casser, juste ignorer

## Chemin de retour vers Multi-Tenant

Si le multi-tenant doit être réactivé :

### Phase 1 : RLS
```sql
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON captures USING (tenant_id = current_setting('app.current_tenant')::int);
```

### Phase 2 : Inscription
- Réactiver `/auth/register` avec création de tenant
- Implémenter `POST /tenants` pour nouveaux comptes
- Ajouter sélection de tenant dans le JWT

### Phase 3 : Quotas
- Implémenter `maxStorageMb`, `maxExportsPerDay` (champs inutilisés)
- Activer le blocage dur sur `maxAiCallsPerDay`

### Phase 4 : Admin
- Réactiver `/admin/users` pour gestion d'équipe
- Activer `member_invitations` workflow

## Routes/Pages multi-tenant actuellement inactives

| Route | Status | Note |
|-------|--------|------|
| `/governance` | Inactive | Approbations mono-utilisateur |
| `/registry` | Inactive | Entrées personnelles uniquement |
| `/approvals` | Active | Workflow personnel |
| `/admin/users` | Active | Gestion d'utilisateurs secondaires |
| `/integrations` | Active | Config globale |

## Règles pour les modifications futures

1. **Ne pas supprimer** les foreign keys `tenant_id`
2. **Ne pas hardcoder** `tenantId = 1` dans le nouveau code - utiliser `req.tenantId`
3. **Garder les migrations** existantes intactes
4. **Documenter** tout retrait de fonctionnalité SaaS
5. **Tester** que le code fonctionne avec n'importe quel `tenantId`

## Historique Git

Les commits contenant le code multi-tenant complet sont préservés :
- `20260623211325_001_initial_schema.sql` - Schéma original avec multi-tenant
- `20260623213836_003_sessions_and_simplification.sql` - Sessions multi-device

## Décision

Le multi-tenant n'est pas supprimé - il est **désactivé par défaut** (un seul tenant). Le chemin de retour est documenté et les migrations sont préservées.
