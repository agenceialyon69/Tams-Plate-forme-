import {
  pgTable,
  text,
  serial,
  timestamp,
  pgEnum,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

export const approvalRiskEnum = pgEnum("approval_risk", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);

export const approvalRequestsTable = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id),
  requestedById: integer("requested_by_id")
    .references(() => usersTable.id),
  reviewedById: integer("reviewed_by_id")
    .references(() => usersTable.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  details: text("details").notNull().default(""),
  risk: approvalRiskEnum("risk").notNull().default("medium"),
  status: approvalStatusEnum("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  metadata: jsonb("metadata"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ApprovalRequest = typeof approvalRequestsTable.$inferSelect;
export type NewApprovalRequest = typeof approvalRequestsTable.$inferInsert;
