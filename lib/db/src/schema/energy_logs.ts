import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const energyLogsTable = pgTable("energy_logs", {
  id: serial("id").primaryKey(),
  level: integer("level").notNull(),
  note: text("note"),
  logDate: text("log_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEnergyLogSchema = createInsertSchema(energyLogsTable).omit({ id: true, createdAt: true });
export type InsertEnergyLog = z.infer<typeof insertEnergyLogSchema>;
export type EnergyLog = typeof energyLogsTable.$inferSelect;
