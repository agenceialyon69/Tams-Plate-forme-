/**
 * Conversations Route
 * Core chat endpoint with multi-agent system integration
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  getAgent,
  runAgent,
  executeTool,
  gatherUserContext,
  getAllTools,
} from "../lib/agents/index";
import type { AgentRole, AgentContext } from "../lib/agents/types";
import { aiChat, aiChatStream } from "../lib/ai";

const router = Router();

// ─── List conversations ─────────────────────────────────────────────────────

router.get("/conversations", async (req, res) => {
  try {
    const { mode, limit } = req.query;

    if (mode) {
      const results = await db.select().from(conversationsTable)
        .where(eq(conversationsTable.mode, mode as "chat" | "chief_of_staff" | "decision" | "red_team" | "execution"))
        .orderBy(desc(conversationsTable.updatedAt))
        .limit(Number(limit) || 20);
      return res.json(results);
    }

    const results = await db.select().from(conversationsTable)
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(Number(limit) || 20);
    return res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing conversations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create conversation ────────────────────────────────────────────────────

router.post("/conversations", async (req, res) => {
  try {
    const { title, mode = "chat" } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const [created] = await db.insert(conversationsTable).values({
      title,
      mode,
    }).returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get conversation ──────────────────────────────────────────────────────

router.get("/conversations/:id", async (req, res) => {
  try {
    const [conv] = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.id, Number(req.params.id)));

    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    return res.json(conv);
  } catch (err) {
    req.log.error({ err }, "Error getting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete conversation ───────────────────────────────────────────────────

router.delete("/conversations/:id", async (req, res) => {
  try {
    await db.delete(conversationsTable).where(eq(conversationsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get messages ──────────────────────────────────────────────────────────

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, Number(req.params.id)))
      .orderBy(messagesTable.createdAt)
      .limit(50);

    return res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Send message (non-streaming) ──────────────────────────────────────────

router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: "content is required" });

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    // Persist user message
    const [userMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      content,
    }).returning();

    // Get conversation history
    const history = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt)
      .limit(20);

    const historyForAgent = history.slice(0, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Select agent based on conversation mode or query content
    const agentRole = (conv.mode || "chat") as AgentRole;
    const agent = getAgent(agentRole) || getAgent("chief_of_staff")!;

    const context: AgentContext = { conversationId };

    // Run agent
    const response = await runAgent(agent, content, historyForAgent, context);

    // Persist assistant message
    const [assistantMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: response.content,
    }).returning();

    // Update conversation
    await db.update(conversationsTable)
      .set({
        messageCount: sql`${conversationsTable.messageCount} + 2`,
        lastMessage: content.slice(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));

    return res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      toolCalls: response.toolCalls,
    });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Streaming endpoint (SSE) ───────────────────────────────────────────────

router.post("/conversations/:id/stream", async (req, res) => {
  const conversationId = Number(req.params.id);
  const { content } = req.body;

  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Persist user message
  const [userMsg] = await db.insert(messagesTable).values({
    conversationId,
    role: "user",
    content,
  }).returning();

  send({ type: "user_id", id: userMsg.id });

  const history = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt)
    .limit(20);

  const historyForAgent = history.slice(0, -1).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Select agent
  const agentRole = (conv.mode || "chat") as AgentRole;
  const agent = getAgent(agentRole) || getAgent("chief_of_staff")!;

  // Get user context
  const userContext = await gatherUserContext();

  let fullContent = "";
  let toolResults: Array<{ name: string; result: string }> = [];

  try {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: `${agent.systemPrompt}\n\nContexte actuel:\n${userContext}` },
      ...historyForAgent,
      { role: "user", content },
    ];

    const stream = aiChatStream({
      model: "google/gemini-2.5-flash",
      messages,
      max_tokens: 1500,
      tools: getAllTools(),
    });

    let pendingToolCalls: Array<{ id: string; index: number; name: string; args: string }> = [];

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        send({ type: "token", content: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!pendingToolCalls[tc.index]) {
            pendingToolCalls[tc.index] = { id: tc.id || "", index: tc.index, name: "", args: "" };
          }
          if (tc.function?.name) pendingToolCalls[tc.index].name = tc.function.name;
          if (tc.function?.arguments) pendingToolCalls[tc.index].args += tc.function.arguments;
        }
      }
    }

    // Execute tool calls
    if (pendingToolCalls.length > 0) {
      for (const tc of pendingToolCalls) {
        let args: Record<string, unknown>;
        try { args = JSON.parse(tc.args); } catch { args = {}; }
        const result = await executeTool(tc.name, args);
        toolResults.push({ name: tc.name, result });
        send({ type: "tool", name: tc.name, result });
      }

      // Follow-up to summarize
      const followUpMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        ...messages,
        { role: "assistant", content: fullContent || "" },
        { role: "system", content: `Actions effectuées:\n${toolResults.map(t => `- ${t.name}: ${t.result}`).join("\n")}\n\nRésume naturellement.` },
      ];

      const followUp = aiChatStream({
        model: "google/gemini-2.5-flash",
        messages: followUpMessages,
        max_tokens: 800,
      });

      for await (const chunk of followUp) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          send({ type: "token", content: delta.content });
        }
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Streaming AI failed");
    const fallback = agent.fallbackResponse;
    fullContent = fallback;
    send({ type: "token", content: fallback });
  }

  // Persist assistant message
  const [assistantMsg] = await db.insert(messagesTable).values({
    conversationId,
    role: "assistant",
    content: fullContent || "...",
  }).returning();

  await db.update(conversationsTable)
    .set({
      messageCount: sql`${conversationsTable.messageCount} + 2`,
      lastMessage: content.slice(0, 100),
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));

  send({ type: "done", id: assistantMsg.id, toolResults });
  res.end();
});

// Les endpoints /agents sont servis par routes/agents.ts (source unique).

export default router;
