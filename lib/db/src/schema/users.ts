import {
  pgTable,
  text,
  serial,
  timestamp,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "pending",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: serial("tenant_id")
    .notNull()
    .references(() => tenantsTable.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  status: userStatusEnum("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
