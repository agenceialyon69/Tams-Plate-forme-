import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  SYSTEM_PROMPT,
  MODE_PROMPTS,
  TOOLS,
  gatherUserContext,
  executeTool,
} from "../lib/agent-tools";

const router = Router();

router.get("/conversations", async (req, res) => {
  try {
    const { mode, limit } = req.query;
    let query = db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt));
    if (mode) {
      const results = await db.select().from(conversationsTable)
        .where(eq(conversationsTable.mode, mode as "chat" | "chief_of_staff" | "decision" | "red_team" | "execution"))
        .orderBy(desc(conversationsTable.updatedAt))
        .limit(Number(limit) || 20);
      return res.json(results);
    }
    const results = await query.limit(Number(limit) || 20);
    return res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing conversations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

router.delete("/conversations/:id", async (req, res) => {
  try {
    await db.delete(conversationsTable).where(eq(conversationsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const [userMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      content,
    }).returning();

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt)
      .limit(20);

    let aiContent: string;
    let toolResults: string[] = [];

    try {
      const { aiChat } = await import("../lib/ai");

      const modePrompt = MODE_PROMPTS[conv.mode] || MODE_PROMPTS.chat;
      const userContext = await gatherUserContext();

      const messages: any[] = [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${modePrompt}\n\nContexte actuel de Mohamed:\n${userContext}` },
        ...history.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content },
      ];

      const completion = await aiChat({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 1000,
        tools: TOOLS,
      });

      const choice = completion.choices[0];

      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.type !== "function") continue;
          const fnName = toolCall.function.name;
          let fnArgs: any;
          try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }
          const result = await executeTool(fnName, fnArgs);
          toolResults.push(result);
        }

        const followUp = await aiChat({
          model: "google/gemini-2.5-flash",
          messages: [
            ...messages,
            { role: "assistant", content: choice.message.content || "" },
            { role: "system", content: `Résultats des actions effectuées:\n${toolResults.join("\n")}\n\nRésume ce qui a été fait à Mohamed de manière naturelle.` },
          ],
          max_tokens: 800,
        });

        aiContent = followUp.choices[0]?.message?.content || "Action effectuée.";
      } else {
        aiContent = choice?.message?.content || "Je n'ai pas pu générer une réponse. Veuillez réessayer.";
      }
    } catch (err) {
      req.log.warn({ err }, "AI chat failed, using fallback");
      aiContent = `[Mode ${conv.mode}] Je traite votre message : "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}". La connexion IA sera disponible prochainement.`;
    }

    const [assistantMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: aiContent,
    }).returning();

    await db.update(conversationsTable)
      .set({
        messageCount: sql`${conversationsTable.messageCount} + 2`,
        lastMessage: content.slice(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));

    return res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Streaming endpoint (SSE) ─────────────────────────────────────────────────
// POST /conversations/:id/stream
// Body: { content: string }
// Events: {"type":"token","content":"..."} | {"type":"tool","name":"...","result":"..."} | {"type":"done","id":N}
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

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt)
    .limit(20);

  let fullContent = "";
  let toolResults: string[] = [];

  try {
    const { aiChatStream } = await import("../lib/ai");

    const modePrompt = MODE_PROMPTS[conv.mode] || MODE_PROMPTS.chat;
    const userContext = await gatherUserContext();

    const messages: any[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${modePrompt}\n\nContexte actuel:\n${userContext}` },
      ...history.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content },
    ];

    const stream = aiChatStream({
      model: "google/gemini-2.5-flash",
      messages,
      max_tokens: 1200,
      tools: TOOLS,
    });

    let pendingToolCalls: any[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        send({ type: "token", content: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!pendingToolCalls[tc.index]) {
            pendingToolCalls[tc.index] = { id: tc.id, name: tc.function?.name ?? "", args: "" };
          }
          if (tc.function?.name) pendingToolCalls[tc.index].name = tc.function.name;
          if (tc.function?.arguments) pendingToolCalls[tc.index].args += tc.function.arguments;
        }
      }
    }

    // Execute pending tool calls
    if (pendingToolCalls.length > 0) {
      for (const tc of pendingToolCalls) {
        let args: any;
        try { args = JSON.parse(tc.args); } catch { args = {}; }
        const result = await executeTool(tc.name, args);
        toolResults.push(result);
        send({ type: "tool", name: tc.name, result });
      }

      // Follow-up to summarize tool actions
      const followUp = aiChatStream({
        model: "google/gemini-2.5-flash",
        messages: [
          ...messages,
          { role: "assistant", content: fullContent || "" },
          { role: "system", content: `Actions effectuées:\n${toolResults.join("\n")}\nRésume naturellement.` },
        ],
        max_tokens: 600,
      });

      for await (const chunk of followUp) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          send({ type: "token", content: delta.content });
        }
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Streaming AI failed, using fallback");
    const fallback = `[Mode ${conv.mode}] Connexion IA temporairement indisponible. Votre message a été reçu.`;
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

export default router;
