import { pgTable, text, serial, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

/**
 * Structured application events (analytics / product observability).
 *
 * Distinct from `audit_logs` (automatic HTTP write log). These are explicit,
 * meaningful events recorded via `trackEvent()` (see api-server `lib/events.ts`).
 * Standardised fields:
 *  - source     : frontend | backend | copilot | agent | workflow | search | system | job
 *  - severity   : low | medium | high | critical (technical triage)
 *  - importance : low | medium | high | critical (business priority)
 *  - workspaceId: reserved for a future workspace/tenant split (nullable now)
 */
export const appEventsTable = pgTable("app_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  tenantId: integer("tenant_id"),
  workspaceId: integer("workspace_id"),
  event: text("event").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull().default("backend"),
  severity: text("severity").notNull().default("low"),
  importance: text("importance").notNull().default("medium"),
  metadata: jsonb("metadata"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppEvent = typeof appEventsTable.$inferSelect;
