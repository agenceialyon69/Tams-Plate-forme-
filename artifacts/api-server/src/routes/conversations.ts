/**
 * Conversations Route
 * Core chat endpoint with multi-agent system integration
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
// INVARIANT (/AGENTS.md) : importer le SYSTÈME D'AGENTS depuis le dossier
// `lib/agents/*` (Chief of Staff → Council → Planner → Runtime → Tools).
// L'import nu "../lib/agents" résoudrait l'ANCIEN fichier lib/agents.ts (système
// hérité utilisé par routes/agents.ts) → mauvaises signatures. NE PAS RÉVERTER.
import { getAgent } from "../lib/agents/definitions";
import {
  runAgent,
  executeTool,
  gatherUserContext,
  getAllTools,
} from "../lib/agents/orchestrator";
import { runChiefWithCouncil } from "../lib/agents/council";
import { planAndExecute } from "../lib/agents/planner";
import type { AgentRole, AgentContext } from "../lib/agents/types";
import { aiChatStream } from "../lib/ai";
import { ReflectionEngine } from "../lib/reflection";

const router = Router();

// Reflection Engine (pilier « Continuous Improvement ») : observe CHAQUE tour du
// Chat pour apprendre (détection de patterns d'échec, auto-mémorisation). C'est
// ce qui branche le moteur de réflexion sur le pipeline principal. Fire-and-forget :
// l'apprentissage ne doit JAMAIS faire échouer une réponse de chat.
function reflectAfterTurn(
  agentRole: string,
  query: string,
  result: string,
  success: boolean,
  durationMs: number,
): void {
  void ReflectionEngine.reflect({
    agentRole,
    query,
    result,
    success,
    durationMs,
    timestamp: new Date(),
  }).catch(() => { /* la réflexion ne bloque jamais le chat */ });
}

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
    const startedAt = Date.now();
    const conversationId = Number(req.params.id);
    const { content, useCouncil = true, usePlanner = false } = req.body;

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

    let responseContent: string;
    let metadata: Record<string, unknown> = {};

    // Use Planner for action-oriented requests
    if (usePlanner) {
      const plan = await planAndExecute(content, await gatherUserContext());
      responseContent = plan.message;
      metadata = { plan: plan.plan, verified: plan.success };
    }
    // Use Council for complex reasoning (Chief of Staff mode)
    else if (useCouncil && (conv.mode === "chief_of_staff" || conv.mode === "decision")) {
      const council = await runChiefWithCouncil(content, historyForAgent);
      responseContent = council.content;
      metadata = { usedCouncil: true };
    }
    // Standard agent
    else {
      const agentRole = (conv.mode || "chat") as AgentRole;
      const agent = getAgent(agentRole) || getAgent("chief_of_staff")!;
      const context: AgentContext = { conversationId };
      const response = await runAgent(agent, content, historyForAgent, context);
      responseContent = response.content;
    }

    // Persist assistant message
    const [assistantMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: responseContent,
    }).returning();

    // Update conversation
    await db.update(conversationsTable)
      .set({
        messageCount: sql`${conversationsTable.messageCount} + 2`,
        lastMessage: content.slice(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));

    // Branche le Reflection Engine sur le pipeline (apprentissage continu).
    reflectAfterTurn(String(conv.mode || "chat"), content, responseContent, true, Date.now() - startedAt);

    return res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      metadata,
    });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Streaming endpoint (SSE) ───────────────────────────────────────────────

router.post("/conversations/:id/stream", async (req, res) => {
  const startedAt = Date.now();
  const conversationId = Number(req.params.id);
  const { content, images } = req.body as { content?: string; images?: string[] };

  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  // Pièces jointes IMAGE (vision) : data URLs base64. Analysées par un modèle
  // multimodal GRATUIT (Gemini). Limité à 4 images raisonnables.
  const attachedImages = (Array.isArray(images) ? images : [])
    .filter((u) => typeof u === "string" && u.startsWith("data:image/") && u.length < 8_000_000)
    .slice(0, 4);

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
    // Streaming via le routeur IA GRATUIT lib/ai.ts (Ollama/Groq/Gemini/
    // OpenRouter) — fetch pur, fallback en chaîne entre fournisseurs, ZÉRO SDK
    // propriétaire et ZÉRO API payante. Les chunks sont OpenAI-compatibles.
    // Contenu utilisateur : texte seul, ou multimodal (texte + images) si des
    // pièces jointes sont présentes (format OpenAI-compatible, lu par Gemini).
    const userContent: unknown = attachedImages.length > 0
      ? [
          { type: "text", text: content },
          ...attachedImages.map((url) => ({ type: "image_url", image_url: { url } })),
        ]
      : content;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
      { role: "system", content: `${agent.systemPrompt}\n\nContexte actuel:\n${userContext}` },
      ...historyForAgent,
      { role: "user", content: userContent },
    ];

    const stream = aiChatStream({
      messages,
      max_tokens: 1500,
      // Vision et function-calling cohabitent mal : avec des images, on privilégie
      // l'analyse visuelle (pas d'outils). Tâche "chat" → modèle multimodal (Gemini).
      tools: attachedImages.length > 0 ? undefined : getAllTools(),
    }, attachedImages.length > 0 ? "chat" : "fast");

    let pendingToolCalls: Array<{ id: string; index: number; name: string; args: string }> = [];

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
            pendingToolCalls[tc.index] = { id: tc.id || "", index: tc.index, name: "", args: "" };
          }
          if (tc.function?.name) pendingToolCalls[tc.index].name = tc.function.name;
          if (tc.function?.arguments) pendingToolCalls[tc.index].args += tc.function.arguments;
        }
      }
    }

    // Execute tool calls — événements alignés sur le frontend (tool_start/tool_done)
    // pour que l'utilisateur VOIE le Chat agir sur la plateforme.
    if (pendingToolCalls.length > 0) {
      for (const tc of pendingToolCalls) {
        let args: Record<string, unknown>;
        try { args = JSON.parse(tc.args); } catch { args = {}; }
        send({ type: "tool_start", name: tc.name, args });
        const result = await executeTool(tc.name, args);
        toolResults.push({ name: tc.name, result });
        send({ type: "tool_done", name: tc.name, result });
      }

      // Follow-up to summarize
      const followUpMessages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
        ...messages,
        { role: "assistant", content: fullContent || "" },
        { role: "system", content: `Actions effectuées:\n${toolResults.map(t => `- ${t.name}: ${t.result}`).join("\n")}\n\nRésume naturellement.` },
      ];

      const followUp = aiChatStream({
        messages: followUpMessages,
        max_tokens: 800,
      }, "fast");

      for await (const chunk of followUp) {
        const delta = chunk.choices[0]?.delta;
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

  // Branche le Reflection Engine sur le pipeline de streaming (apprentissage continu).
  reflectAfterTurn(String(conv.mode || "chat"), content, fullContent, fullContent.length > 0, Date.now() - startedAt);

  send({ type: "done", id: assistantMsg.id, toolResults });
  res.end();
});

// NOTE (/AGENTS.md) : les endpoints agents publics (/agents, /agents/:id/run,
// /agents/council, /agents/orchestrate, /agents/pipeline, /agents/delegate)
// sont servis par routes/agents.ts — c'est ce que la page Agents appelle.
// Ce routeur-ci ne gère QUE les conversations + le chat (CRUD, messages,
// streaming SSE) pour éviter toute collision de routes (double GET /agents).

export default router;
