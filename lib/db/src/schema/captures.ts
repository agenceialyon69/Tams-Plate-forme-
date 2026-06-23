import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const capturesTable = pgTable("captures", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  source: text("source").notNull().default("text"),
  extractedTasks: integer("extracted_tasks").notNull().default(0),
  extractedEvents: integer("extracted_events").notNull().default(0),
  extractedLearnings: integer("extracted_learnings").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCaptureSchema = createInsertSchema(capturesTable).omit({ id: true, createdAt: true });
export type InsertCapture = z.infer<typeof insertCaptureSchema>;
export type Capture = typeof capturesTable.$inferSelect;
