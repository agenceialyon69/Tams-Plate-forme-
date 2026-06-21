import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Persisted Copilot conversation history.
 *
 * Gives the Copilot a memory across sessions/devices: each chat turn stores the
 * user message and the assistant reply under a `conversationId`, so the user can
 * resume a thread instead of re-explaining everything.
 *
 * Distinct from the `memory` table (the life-copilot's long-term notes). Here it
 * is raw conversation transcript, grouped by conversation.
 */
export const copilotMessagesTable = pgTable("copilot_messages", {
  id: serial("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  userId: integer("user_id"),
  tenantId: integer("tenant_id"),
  productId: text("product_id"),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CopilotMessageRow = typeof copilotMessagesTable.$inferSelect;
