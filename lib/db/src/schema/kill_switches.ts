import {
  pgTable,
  text,
  serial,
  timestamp,
  pgEnum,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

export const killSwitchTargetEnum = pgEnum("kill_switch_target", [
  "agent",
  "provider",
  "workflow",
  "module",
]);

export const killSwitchesTable = pgTable("kill_switches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id),
  target: killSwitchTargetEnum("target").notNull(),
  targetName: text("target_name").notNull(),
  active: boolean("active").notNull().default(false),
  reason: text("reason"),
  activatedById: integer("activated_by_id")
    .references(() => usersTable.id),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KillSwitch = typeof killSwitchesTable.$inferSelect;
export type NewKillSwitch = typeof killSwitchesTable.$inferInsert;
