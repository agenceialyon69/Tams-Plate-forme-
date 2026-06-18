import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const tenantQuotasTable = pgTable("tenant_quotas", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .unique()
    .references(() => tenantsTable.id),
  maxAiCallsPerDay: integer("max_ai_calls_per_day").notNull().default(200),
  maxAiCallsPerMonth: integer("max_ai_calls_per_month").notNull().default(5000),
  maxUsersCount: integer("max_users_count").notNull().default(10),
  maxStorageMb: integer("max_storage_mb").notNull().default(1000),
  maxExportsPerDay: integer("max_exports_per_day").notNull().default(10),
  costBudgetCentsPerMonth: integer("cost_budget_cents_per_month").notNull().default(5000),
  aiCallsToday: integer("ai_calls_today").notNull().default(0),
  aiCallsThisMonth: integer("ai_calls_this_month").notNull().default(0),
  costCentsThisMonth: integer("cost_cents_this_month").notNull().default(0),
  lastResetDate: text("last_reset_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantQuota = typeof tenantQuotasTable.$inferSelect;
export type NewTenantQuota = typeof tenantQuotasTable.$inferInsert;
