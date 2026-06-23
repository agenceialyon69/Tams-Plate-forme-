import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { userRoleEnum } from "./users";

export const memberInvitationsTable = pgTable("member_invitations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  invitedById: integer("invited_by_id")
    .notNull()
    .references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MemberInvitation = typeof memberInvitationsTable.$inferSelect;
export type NewMemberInvitation = typeof memberInvitationsTable.$inferInsert;
