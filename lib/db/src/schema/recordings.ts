import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recordingsTable = pgTable("recordings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  context: text("context"),
  meetingType: text("meeting_type").notNull().default("meeting"),
  durationSeconds: integer("duration_seconds"),
  transcript: text("transcript"),
  summary: text("summary"),
  actionItems: text("action_items"),      // JSON string: [{title, owner, deadline, priority}]
  commitments: text("commitments"),       // JSON string: [{who, what, deadline}]
  decisions: text("decisions"),           // JSON string: [{topic, decision, rationale}]
  blindSpots: text("blind_spots"),
  redTeamCritique: text("red_team_critique"),
  tamsMessage: text("tams_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecordingSchema = createInsertSchema(recordingsTable).omit({ id: true, createdAt: true });
export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Recording = typeof recordingsTable.$inferSelect;
