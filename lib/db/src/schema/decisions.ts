import { pgTable, serial, text, integer, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const decisionStatusEnum = pgEnum("decision_status", ["pending", "analyzing", "decided", "archived"]);

export const decisionsTable = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  context: text("context"),
  options: jsonb("options").notNull().default([]),
  advantages: jsonb("advantages").notNull().default([]),
  risks: jsonb("risks").notNull().default([]),
  aiAdvice: text("ai_advice"),
  redTeamAdvice: text("red_team_advice"),
  result: text("result"),
  learnings: text("learnings"),
  status: decisionStatusEnum("status").notNull().default("pending"),
  confidenceScore: integer("confidence_score").notNull().default(50),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDecisionSchema = createInsertSchema(decisionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDecision = z.infer<typeof insertDecisionSchema>;
export type Decision = typeof decisionsTable.$inferSelect;
