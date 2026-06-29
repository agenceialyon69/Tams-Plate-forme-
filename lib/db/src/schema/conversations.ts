import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationModeEnum = pgEnum("conversation_mode", [
  "chat", "chief_of_staff", "decision", "red_team", "execution"
]);

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  mode: conversationModeEnum("mode").notNull().default("chat"),
  messageCount: integer("message_count").notNull().default(0),
  lastMessage: text("last_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
