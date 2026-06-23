import {
  pgTable,
  text,
  serial,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const registryEntryTypeEnum = pgEnum("registry_entry_type", [
  "agent",
  "prompt",
  "playbook",
  "policy",
  "workflow",
  "provider",
  "integration",
  "data_source",
]);

export const registryEntryStatusEnum = pgEnum("registry_entry_status", [
  "active",
  "draft",
  "deprecated",
  "disabled",
]);

export const registrySensitivityEnum = pgEnum("registry_sensitivity", [
  "public",
  "internal",
  "restricted",
  "critical",
]);

export const registryEntriesTable = pgTable("registry_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id),
  type: registryEntryTypeEnum("type").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  owner: text("owner").notNull().default("system"),
  version: text("version").notNull().default("1.0.0"),
  status: registryEntryStatusEnum("status").notNull().default("draft"),
  sensitivity: registrySensitivityEnum("sensitivity").notNull().default("internal"),
  scope: text("scope").notNull().default("global"),
  config: text("config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RegistryEntry = typeof registryEntriesTable.$inferSelect;
export type NewRegistryEntry = typeof registryEntriesTable.$inferInsert;
