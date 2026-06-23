# Schemas — modèle de données

Référence des tables PostgreSQL (Drizzle, `lib/db/src/schema/`). Le schéma est
appliqué/réparé au démarrage par `ensure-schema.ts` (idempotent). Toute nouvelle
colonne doit y être ajoutée en `ALTER ... ADD COLUMN IF NOT EXISTS`.

> ⚠️ **Isolation multi-tenant** : les tables « data produit » portent un
> `tenantId` mais l'isolation **n'est pas encore appliquée** dans les requêtes
> (voir `multi-tenant-plan.md`). Mono-utilisateur pour l'instant.

## Auth & organisation
| Table | Rôle | Colonnes clés |
|---|---|---|
| `tenants` | Organisation (1 par owner en mono-user) | id, name, slug, createdAt |
| `users` | Comptes | id, tenantId, email (unique), passwordHash, name, role (owner/admin/member/viewer), status, lastLoginAt |
| `member_invitations` | Invitations d'équipe | id, tenantId, email, role, token, expiresAt |
| `password_reset_tokens` | Reset mot de passe | id, userId, tokenHash, expiresAt, usedAt |
| `tenant_quotas` | Quotas par tenant (incl. IA) | tenantId, aiCallsCount, period… |

## Données produit (copilote)
| Table | Rôle | Colonnes clés |
|---|---|---|
| `captures` | Saisies rapides (texte/voix) | id, tenantId, content, source, createdAt |
| `tasks` | Tâches | id, tenantId, title, dueDate, priority, priorityDomain, status |
| `events` | **Calendrier** (≠ analytics) | id, tenantId, title, eventDate, eventTime, category |
| `learnings` | Apprentissages | id, tenantId, subject, content, category |
| `decisions` | Décisions analysées (Red Team) | id, tenantId, question, analysis, alternatives, blindSpots |
| `memory` | Mémoire long terme | id, tenantId, content, createdAt |
| `recordings` | Enregistrements + analyse | id, tenantId, title, transcript, summary, actionItems |
| `evening_reviews` | Revues du soir | id, tenantId, mostImportantThing, energyLevel… |
| `energy_logs` | Niveaux d'énergie (signaux) | id, tenantId, level, createdAt |

## Prospection (CRM)
| Table | Rôle | Colonnes clés |
|---|---|---|
| `leads` | Prospects + scoring IA | id, tenantId, name, company, status, score, nextBestAction, redTeamWarning |
| `lead_activities` | Historique d'interactions | id, leadId, type, content, createdAt |

## Gouvernance & observabilité
| Table | Rôle | Colonnes clés |
|---|---|---|
| `audit_logs` | Journal HTTP auto (écritures) | id, userId, tenantId, action, resource, method, path, statusCode, ip, createdAt |
| `app_events` | **Événements applicatifs structurés** (analytics) | id, userId, tenantId, workspaceId?, event, category, source, severity, importance, metadata, ip, createdAt |
| `approval_requests` | Demandes d'approbation | id, tenantId, action, status, requestedBy |
| `kill_switches` | Coupe-circuits par fonctionnalité | id, key, enabled |
| `registry_entries` | Registre (prompts/agents/outils) | id, key, value, version |
| `copilot_messages` | **Mémoire de conversation du Copilot** (historique persistant) | id, conversationId, userId, tenantId, productId, role, content, createdAt |

### `audit_logs` vs `app_events`
- **`audit_logs`** : automatique, généré par `auditMiddleware` sur chaque requête
  d'écriture (qui a fait quoi via HTTP). Orienté **sécurité/traçabilité**.
- **`app_events`** : explicite, via `trackEvent()` (voir `lib/events.ts`). Orienté
  **produit/analytics** (ex. `audit_run`, `copilot_message`, `video_generated`).
  Standard (ADR-010) : `source` ∈ {frontend, backend, copilot, agent, workflow,
  search, system, job} · `severity` ∈ {low, medium, high, critical} (technique) ·
  `importance` ∈ {low, medium, high, critical} (priorité métier) · `metadata` libre.

## Conventions
- Clés primaires `serial`. Horodatage `created_at` (timezone) `defaultNow()`.
- `tenant_id` présent sur les tables data (isolation à activer plus tard).
- JSON libre en `jsonb` (`details`, `metadata`).
- Migration : éditer le fichier `schema/*.ts` **et** `ensure-schema.ts`.
