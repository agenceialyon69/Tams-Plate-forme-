import { pgTable, text, serial, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

/**
 * Structured application events (analytics / product observability).
 *
 * Distinct from `audit_logs` (automatic HTTP write log). These are explicit,
 * meaningful events recorded via `trackEvent()` (see api-server `lib/events.ts`):
 *  - source   : where it came from — front | backend | copilot | jobs
 *  - severity : info | warning | critical (triage)
 *  - workspaceId : reserved for a future workspace/tenant split (nullable now)
 */
export const appEventsTable = pgTable("app_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  tenantId: integer("tenant_id"),
  workspaceId: integer("workspace_id"),
  event: text("event").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull().default("backend"),
  severity: text("severity").notNull().default("info"),
  metadata: jsonb("metadata"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppEvent = typeof appEventsTable.$inferSelect;
