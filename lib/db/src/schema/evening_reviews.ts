import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eveningReviewsTable = pgTable("evening_reviews", {
  id: serial("id").primaryKey(),
  mostImportantThing: text("most_important_thing").notNull(),
  energyLevel: integer("energy_level").notNull(),
  deferredItems: text("deferred_items"),
  abandonedItems: text("abandoned_items"),
  freeReflection: text("free_reflection"),
  koreResponse: text("kore_response"),
  reviewDate: text("review_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEveningReviewSchema = createInsertSchema(eveningReviewsTable).omit({ id: true, createdAt: true });
export type InsertEveningReview = z.infer<typeof insertEveningReviewSchema>;
export type EveningReview = typeof eveningReviewsTable.$inferSelect;
