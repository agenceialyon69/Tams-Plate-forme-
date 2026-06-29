import { pgTable, serial, text, date, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const briefingsTable = pgTable("briefings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  greeting: text("greeting").notNull(),
  priorities: jsonb("priorities").notNull().default([]),
  risks: jsonb("risks").notNull().default([]),
  opportunities: jsonb("opportunities").notNull().default([]),
  recommendations: jsonb("recommendations").notNull().default([]),
  activeProjectsCount: integer("active_projects_count").notNull().default(0),
  pendingTasksCount: integer("pending_tasks_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBriefingSchema = createInsertSchema(briefingsTable).omit({ id: true, createdAt: true });
export type InsertBriefing = z.infer<typeof insertBriefingSchema>;
export type Briefing = typeof briefingsTable.$inferSelect;
