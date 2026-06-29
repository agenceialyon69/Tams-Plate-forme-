import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { memoriesTable } from "./memories";

export const edgeTypeEnum = pgEnum("edge_type", [
  "works_on",
  "knows",
  "related_to",
  "decided_about",
  "part_of",
  "leads_to",
  "references",
  "collaborates_with",
]);

export const memoryEdgesTable = pgTable("memory_edges", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => memoriesTable.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull().references(() => memoriesTable.id, { onDelete: "cascade" }),
  type: edgeTypeEnum("type").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMemoryEdgeSchema = createInsertSchema(memoryEdgesTable).omit({ id: true, createdAt: true });
export type InsertMemoryEdge = z.infer<typeof insertMemoryEdgeSchema>;
export type MemoryEdge = typeof memoryEdgesTable.$inferSelect;
