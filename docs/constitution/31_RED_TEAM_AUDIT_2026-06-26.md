# 31 — Red Team Audit (2026-06-26)

> Comprehensive security and architecture audit performed autonomously.
> Commit reference: `0609fe6` (HEAD at audit start).

## Executive Summary

TAMS is a functional single-user Personal AI OS with approximately **70% implementation completeness**. Critical blockers exist that prevent production deployment of the Memory Graph module. Security posture is adequate for sandbox use but needs hardening for internet exposure.

---

## Critical Findings (Must Fix Before Production)

### 1. `.env` Not in `.gitignore` — FIXED

**Status:** FIXED in this audit
**Impact:** Environment secrets could be committed

**Fix Applied:** Added `.env`, `.env.*` to `.gitignore` (excluding `.env.example`)

### 2. `memory_edges` Table Not Deployed

**Status:** OPEN
**File:** `lib/db/src/schema/memory-edges.ts`
**Impact:** Memory Graph feature completely non-functional on Railway

**Remediation:**
```bash
pnpm --filter @workspace/db run push
```

This must be executed with `DATABASE_URL` pointing to Railway PostgreSQL.

### 3. Missing Input Validation (Zod)

**Status:** OPEN
**Files:** `artifacts/api-server/src/routes/*.ts`
**Impact:** 14 endpoints accept unvalidated POST/PATCH bodies

**Affected Endpoints:**
- POST /projects — no schema validation
- PATCH /projects/:id — no schema validation
- POST /tasks — only title required check
- PATCH /tasks/:id — no validation
- POST /contacts — no schema validation
- PATCH /contacts/:id — no validation
- POST /assets — no schema validation
- PATCH /assets/:id — no schema validation
- POST /memories — no schema validation
- PATCH /memories/:id — no validation
- POST /memories/:id/edges — no validation
- POST /decisions — no schema validation
- PATCH /decisions/:id — no validation
- POST /decisions/:id/tasks — unsafe cast

**Recommendation:**
Wrap all request bodies in Zod schemas from `@workspace/api-zod`:
```typescript
import { CreateProjectInput } from "@workspace/api-zod";

router.post("/projects", async (req, res) => {
  const parsed = CreateProjectInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }
  // ... use parsed.data
});
```

### 4. N+1 Queries in List Endpoints

**Status:** OPEN
**Files:** `projects.ts`, `tasks.ts`
**Impact:** Performance degradation with scale

**Problem (projects.ts:15-34):**
```typescript
const projects = await db.select().from(projectsTable);
const allTasks = await db.select().from(tasksTable); // Loads ALL tasks
// Then filters in-memory: O(P*T)
```

**Fix:** Use SQL aggregation with JOIN + GROUP BY:
```typescript
const result = await db
  .select({
    id: projectsTable.id,
    name: projectsTable.name,
    taskCount: sql<number>`COUNT(${tasksTable.id})`,
  })
  .from(projectsTable)
  .leftJoin(tasksTable, eq(tasksTable.projectId, projectsTable.id))
  .groupBy(projectsTable.id);
```

### 5. No Pagination on List Endpoints

**Status:** OPEN
**Impact:** Memory exhaustion on large datasets

**Affected:** All GET list endpoints return full tables without LIMIT

**Recommendation:** Add pagination parameters:
```typescript
const limit = Math.min(Number(req.query.limit) || 20, 100);
const offset = Number(req.query.offset) || 0;
```

---

## High Severity Findings

### 6. Helmet.js Not Installed

**Status:** OPEN
**Impact:** Missing security headers (X-Frame-Options, CSP, HSTS, X-Content-Type-Options)

**Recommendation:**
```bash
pnpm --filter @workspace/api-server add helmet
```
```typescript
import helmet from "helmet";
app.use(helmet());
```

### 7. CORS Configured Permissively

**File:** `app.ts:33`
**Code:** `app.use(cors());` — allows any origin

**Impact:** Any website can call the API

**Recommendation for production:**
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "same-origin",
  credentials: true,
}));
```

### 8. Delete Operations Don't Cascade

**Files:** `projects.ts:83-87`, `contacts.ts:73`
**Impact:** Orphaned records when parent deleted

**Problem:** Deleting a project does not delete associated tasks.

**Fix Options:**
1. Add DB-level CASCADE constraint
2. Delete children in application before parent

### 9. Silent Error Swallowing in logActivity

**Files:** Multiple routes
**Code:** `catch {}` — hides all errors

**Impact:** Activity logging failures invisible

**Fix:** Log errors:
```typescript
catch (err) {
  logger.warn({ err }, "Failed to log activity");
}
```

---

## Medium Severity Findings

### 10. No CI/CD Pipeline

**Status:** OPEN
**Impact:** No automated quality gates

**Constitution requires:** typecheck, build, tests, healthcheck

**Recommendation:** Create `.github/workflows/ci.yml`

### 11. No Test Framework Installed

**Status:** OPEN
**Impact:** Zero automated tests

**Constitution 11_TESTING_STANDARD.md** specifies Vitest + Supertest.

### 12. ID Parameter Validation Missing

**Pattern:** `Number(req.params.id)` returns NaN for invalid input

**Impact:** Unexpected query behavior

**Fix:**
```typescript
const id = parseInt(req.params.id, 10);
if (isNaN(id) || id <= 0) {
  return res.status(400).json({ error: "Invalid ID" });
}
```

### 13. Duplicate Code in logActivity

**Files:** `projects.ts`, `tasks.ts`, `contacts.ts`, `decisions.ts`

**Problem:** Identical function duplicated 4 times.

**Fix:** Extract to `lib/activity.ts` and import.

---

## Low Severity Findings

### 14. Hardcoded User Context

**Files:** Frontend pages
**Impact:** "Bonjour Mohamed" hardcoded

**Fix:** Use auth context when available.

### 15. API Response Format Inconsistency

**Constitution specifies:** `{ data: <payload> }`
**Reality:** Returns raw objects

**Impact:** Client expectations mismatch

### 16. Express 5 Wildcard Syntax

**File:** `app.ts:57`
**Code:** `app.get("/{*splat}", ...)`

**Note:** Correct for Express 5, but may confuse readers familiar with Express 4.

---

## Security Positive Findings

### What's Working

1. **Rate Limiting:** Implemented and mounted (20 req/min AI, 120 req/min general)
2. **Error Handler:** Centralized, hides stack traces in production
3. **SQL Injection:** Protected via Drizzle ORM parameterized queries
4. **XSS:** No unsafe `dangerouslySetInnerHTML` in handlers (only in UI chart CSS)
5. **Request Logging:** pino-http mounted for HTTP access logs
6. **Secrets:** Not exposed in client-side code (server-only env vars)
7. **JSON Body Limit:** Express default (100kb) enforced

---

## Architecture Findings

### Monorepo Structure

- Well-organized pnpm workspaces
- Clear separation: artifacts (apps), lib (shared)
- TypeScript references correct

### Dependencies

- Core deps up-to-date (React 19, Express 5, TypeScript 5.9)
- No known vulnerable packages in lock file
- Radix UI version drift between tams and mockup-sandbox (minor)

### Build Configuration

- Railway deployment via nixpacks.toml configured correctly
- Health endpoint matches Railway expectation
- esbuild bundle excludes native modules correctly

---

## Missing Features vs Constitution

| Feature | Documented | Implemented |
|---------|-------------|-------------|
| Memory Graph visualization | Yes | No |
| Contacts↔Projects linking | Yes | No |
| Project detailed view | Yes | No |
| CI/CD automation | Yes | No |
| Tests | Yes | No |
| Helmet.js headers | Yes | No |
| Auto-linking memories | Yes | No |
| Decision timeline view | Yes | No |
| Image generation | Yes | No |

---

## Remediation Priority

### Immediate (Before Next Deploy)
1. Push `memory_edges` to Railway DB
2. Add `.env` to `.gitignore` ✓ DONE
3. Add Helmet.js

### Short Term (This Week)
4. Wrap POST/PATCH endpoints in Zod validation
5. Add pagination to list endpoints
6. Create shared `logActivity` utility
7. Add cascade delete for projects → tasks

### Medium Term (This Month)
8. Set up GitHub Actions CI
9. Install Vitest + write first tests
10. Add input validation middleware
11. Implement Memory Graph visualization

---

## Audit Conclusion

**Overall Assessment:** TAMS is a well-architected prototype with 70% feature completion. Core functionality (Chief of Staff, Chat, Work OS) works. Critical blockers prevent Memory Graph from functioning in production.

**Security Maturity:** Adequate for single-user sandbox. Hardening required for internet exposure.

**Technical Debt:** Moderate. N+1 queries and missing validation are the primary concerns.

**Recommendation:** Fix the 5 critical items before considering further feature development. The foundation is solid; polish before expansion.
