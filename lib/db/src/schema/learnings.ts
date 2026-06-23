import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const learningsTable = pgTable("learnings", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("personal"),
  captureId: integer("capture_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLearningSchema = createInsertSchema(learningsTable).omit({ id: true, createdAt: true });
export type InsertLearning = z.infer<typeof insertLearningSchema>;
export type Learning = typeof learningsTable.$inferSelect;
