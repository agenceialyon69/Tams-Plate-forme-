import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { contactsTable } from "./contacts";

export const projectContactsTable = pgTable("project_contacts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  role: text("role"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectContactSchema = createInsertSchema(projectContactsTable).omit({ id: true, createdAt: true });
export type InsertProjectContact = z.infer<typeof insertProjectContactSchema>;
export type ProjectContact = typeof projectContactsTable.$inferSelect;
