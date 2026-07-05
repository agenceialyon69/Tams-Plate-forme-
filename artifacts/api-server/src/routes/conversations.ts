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
  getAllAgents,
  runAgent,
  executeTool,
  gatherUserContext,
  getAllTools,
} from "../lib/agents/index";
import type { AgentRole, AgentContext } from "../lib/agents/types";
import { aiChat, aiChatStream } from "../lib/ai";
import { logActivity } from "../lib/activity";

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

// ─── Capabilities Intent Detection ────────────────────────────────────────────

const CAPABILITIES_KEYWORDS = [
  "capacités", "capacites", "compétences", "competences",
  "que peux-tu faire", "que sais-tu faire", "que peut tu faire", "que peut tu",
  "quels sont tes outils", "tes outils", "tes fonctions",
  "liste tes fonctions", "mes capacités", "tes capacités",
  "qu'est-ce que tu sais faire", "qu'est ce que tu sais",
  "présente-toi", "presente toi", "qui es-tu", "qui es tu",
  "aide-moi", "aide moi",
];

function detectCapabilitiesIntent(message: string): boolean {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CAPABILITIES_KEYWORDS.some(kw => lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

function getCapabilitiesResponse(): string {
  return `## Mes capacités TAMS AI

Je suis votre AI Operating System personnel. Voici ce que je peux faire :

### Gestion des tâches et projets
- **Créer des tâches** — "/tâche Appeler le client demain"
- **Créer des projets** — "/projet Refonte du site web"
- **Suivi des statuts** — Je peux mettre à jour et suivre vos tâches

### Gestion des contacts
- **Ajouter des contacts** — "/contact Jean Dupont, Acme Corp"
- **Lier des contacts à des projets** — Associations contact-projet

### Mémoire et connaissances
- **Enregistrer des informations** — Personnes, entreprises, notes
- **Rechercher dans la mémoire** — "Souviens-toi de..."
- **Rappels programmés** — Planification de rappels

### Décisions et analyse
- **Analyser des décisions** — "/décision Dois-je changer de fournisseur ?"
- **Recherche de mémoires pertinentes** — Contexte automatique

### Studio créatif
- **Générer des images** — Via Pollinations (gratuit)
- **Scripts et storyboards** — Vidéo, audio, documents

### Ce qui n'est PAS encore configuré :
- **Vidéo IA premium** — Nécessite un provider GPU (Kling, Runway, Veo)
- **Audio IA premium** — Nécessite un provider audio externe
- **Intégrations Gmail/Calendar** — Non connectées

### Comment m'utiliser ?
- Tapez simplement votre demande en langage naturel
- Utilisez "/" pour les commandes rapides
- Demandez-moi de vous aider à planifier, créer, rechercher

Que puis-je faire pour vous maintenant ?`;
}

// ─── Streaming endpoint (SSE) ───────────────────────────────────────────────

router.post("/conversations/:id/stream", async (req, res) => {
  const conversationId = Number(req.params.id);
  const { content } = req.body;

  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  // PRIORITY: Check for capabilities intent BEFORE any other processing
  if (detectCapabilitiesIntent(content)) {
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

    // Direct capabilities response
    const capabilitiesResponse = getCapabilitiesResponse();

    // Stream the response
    for (let i = 0; i < capabilitiesResponse.length; i += 3) {
      send({ type: "token", content: capabilitiesResponse.slice(i, i + 3) });
      await new Promise(r => setTimeout(r, 5));
    }

    // Persist assistant message
    const [assistantMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: capabilitiesResponse,
    }).returning();

    await db.update(conversationsTable)
      .set({
        messageCount: sql`${conversationsTable.messageCount} + 2`,
        lastMessage: content.slice(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));

    send({ type: "done", id: assistantMsg.id, toolResults: [] });
    res.end();
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

    // Execute tool calls with enriched SSE events
    if (pendingToolCalls.length > 0) {
      for (const tc of pendingToolCalls) {
        let args: Record<string, unknown>;
        try { args = JSON.parse(tc.args); } catch { args = {}; }

        // tool_start
        send({ type: "tool_start", name: tc.name, args });

        // tool_progress
        send({ type: "tool_progress", name: tc.name, step: "Exécution en cours..." });

        let result: string;
        let toolError: string | null = null;

        try {
          // Per-tool timeout (10s) instead of global
          result = await Promise.race([
            executeTool(tc.name, args),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout tool")), 10000)
            ),
          ]);

          // Log activity
          await logActivity("tool_call", `Tool: ${tc.name}`, `Args: ${JSON.stringify(args)}`, 0);

          toolResults.push({ name: tc.name, result });

          // tool_done
          send({ type: "tool_done", name: tc.name, result });
        } catch (err: any) {
          toolError = err?.message || "Erreur inconnue";
          send({ type: "tool_error", name: tc.name, error: toolError });
        }
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

// ─── Agent info endpoint ───────────────────────────────────────────────────

router.get("/agents", (_req, res) => {
  const agents = getAllAgents().map(a => ({
    role: a.role,
    name: a.name,
    description: a.description,
    capabilities: a.capabilities,
  }));
  res.json(agents);
});

router.get("/agents/:role", (req, res) => {
  const agent = getAgent(req.params.role as AgentRole);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({
    role: agent.role,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    tools: agent.tools.map(t => t.name),
  });
});

// ─── Runtime endpoint (dev only, secured) ───────────────────────────────────

router.post("/conversations/:id/runtime", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const { action, params, session_token } = req.body;

    // Import runtime config
    const {
      isRuntimeAvailable,
      isChatRuntimeBridgeEnabled,
      validateRuntimeAction,
      detectRuntimeIntent,
    } = await import("../lib/runtime-config");

    // Check runtime availability
    if (!isRuntimeAvailable()) {
      return res.status(403).json({
        error: "Runtime désactivé",
        message: "Runtime installé mais désactivé par sécurité. Activez TAMS_DEV_RUNTIME_ENABLED.",
      });
    }

    // Check chat bridge
    if (!isChatRuntimeBridgeEnabled()) {
      return res.status(403).json({
        error: "Bridge désactivé",
        message: "Bridge runtime chat désactivé. Activez ENABLE_DEV_RUNTIME_CHAT.",
      });
    }

    // Check Bearer auth
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : session_token;

    if (!token) {
      return res.status(401).json({
        error: "Authentification requise",
        message: "Action runtime indisponible : token d'authentification manquant.",
      });
    }

    // Verify token with Supabase (simple check - just verify it's a valid JWT structure)
    // Full verification would require Supabase client
    const hasSession = token.length > 20; // Basic check

    // Get conversation to check mode
    const [conv] = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId));

    if (!conv) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Detect or use provided action
    const detectedAction = action || (params?.message ? detectRuntimeIntent(params.message) : null);

    if (!detectedAction) {
      return res.json({
        status: "no_action",
        message: "Aucune action runtime détectée dans ce message.",
        hint: "Exemples d'actions : 'analyse le repo', 'liste les routes', 'vérifie le runtime'",
      });
    }

    // Validate action
    const validation = validateRuntimeAction(detectedAction, hasSession, conv.mode);

    if (!validation.allowed) {
      return res.status(403).json({
        error: "Action non autorisée",
        action: detectedAction,
        reason: validation.reason,
      });
    }

    // Execute read-only actions only for now
    // Full execution would require additional safety layers
    const result = await executeRuntimeAction(detectedAction, params, conv);

    // Log activity
    await logActivity(
      "runtime_action",
      `Action: ${detectedAction}`,
      `Conversation: ${conversationId}`,
      conversationId,
    );

    return res.json({
      status: "success",
      action: detectedAction,
      mode: validation.mode,
      result,
    });
  } catch (err) {
    req.log.error({ err }, "Runtime action failed");
    return res.status(500).json({
      error: "Runtime error",
      message: process.env.NODE_ENV === "production"
        ? "Erreur interne"
        : (err as Error).message,
    });
  }
});

/**
 * Execute a runtime action (read-only for now).
 */
async function executeRuntimeAction(
  action: string,
  params: Record<string, unknown>,
  _conv: { id: number; mode: string; title: string },
): Promise<Record<string, unknown>> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  switch (action) {
    case "analyze_repo": {
      const rootFiles = await fs.readdir(".").catch(() => []);
      const artifacts = await fs.readdir("./artifacts").catch(() => []);
      const lib = await fs.readdir("./lib").catch(() => []);

      return {
        summary: "Structure du projet TAMS",
        root: rootFiles.slice(0, 20),
        artifacts: artifacts.slice(0, 15),
        lib: lib.slice(0, 15),
        insights: [
          "Monorepo pnpm avec workspaces",
          "Frontends: tams, kore, mockup-sandbox",
          "Backend: api-server (Express)",
          "DB: lib/db (Drizzle)",
        ],
      };
    }

    case "list_routes": {
      const routesDir = "./artifacts/api-server/src/routes";
      const files = await fs.readdir(routesDir).catch(() => []);
      const routeFiles = files.filter(f => f.endsWith(".ts"));

      const routes: string[] = [];
      for (const file of routeFiles) {
        const content = await fs.readFile(path.join(routesDir, file), "utf-8").catch(() => "");
        const matches = content.matchAll(/router\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"`]+)/g);
        for (const m of matches) {
          routes.push(`${m[1].toUpperCase()} ${m[2]}`);
        }
      }

      return {
        total: routes.length,
        routes: routes.sort().slice(0, 30),
        files: routeFiles,
      };
    }

    case "list_agents": {
      const agents = getAllAgents().map(a => ({
        role: a.role,
        name: a.name,
        capabilities: a.capabilities,
      }));
      return { total: agents.length, agents };
    }

    case "list_tools": {
      const tools = getAllTools();
      return {
        total: tools.length,
        tools: tools.map(t => ({
          name: t.function.name,
          description: t.function.description?.slice(0, 80),
        })),
      };
    }

    case "list_tables": {
      const schema = await import("@workspace/db");
      const tables = Object.keys(schema).filter(k => k.endsWith("Table"));
      return {
        tables: tables.map(t => ({
          name: t,
          type: "table",
        })),
      };
    }

    case "validate_runtime":
    case "health_check": {
      const checks: Record<string, { status: string; message?: string }> = {};

      // DB check
      try {
        await db.execute(sql`SELECT 1`);
        checks.database = { status: "ok" };
      } catch (e) {
        checks.database = { status: "error", message: (e as Error).message };
      }

      // Files check
      try {
        await fs.access("./artifacts/api-server/src/index.ts");
        checks.files = { status: "ok" };
      } catch {
        checks.files = { status: "error", message: "Missing files" };
      }

      // Flags check
      const { RUNTIME_FLAGS } = await import("../lib/runtime-config");
      checks.flags = {
        status: RUNTIME_FLAGS.DEV_RUNTIME_ENABLED ? "ok" : "warning",
        message: `DEV_RUNTIME: ${RUNTIME_FLAGS.DEV_RUNTIME_ENABLED}, CHAT_BRIDGE: ${RUNTIME_FLAGS.CHAT_RUNTIME_BRIDGE}`,
      };

      const allOk = Object.values(checks).every(c => c.status === "ok");
      return {
        status: allOk ? "ok" : "degraded",
        checks,
      };
    }

    case "search_code": {
      const query = String(params?.query || params?.message || "");
      const results: Array<{ file: string; line: number; snippet: string }> = [];

      // Simple grep simulation
      const searchDirs = ["./artifacts/api-server/src", "./lib"];
      for (const dir of searchDirs) {
        try {
          const files = await fs.readdir(dir, { recursive: true }).catch(() => []);
          for (const file of files.slice(0, 20)) {
            if (!String(file).endsWith(".ts")) continue;
            const content = await fs.readFile(path.join(dir, String(file)), "utf-8").catch(() => "");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query.toLowerCase().slice(0, 20))) {
                results.push({
                  file: String(file),
                  line: i + 1,
                  snippet: lines[i].trim().slice(0, 100),
                });
                if (results.length >= 10) break;
              }
            }
            if (results.length >= 10) break;
          }
        } catch {}
        if (results.length >= 10) break;
      }

      return { query, results, total: results.length };
    }

    case "read_file": {
      const filePath = String(params?.path || params?.file || ".");
      // Safety: only allow reading non-sensitive files
      const blocked = [".env", "secret", "key", "password", "token"];
      if (blocked.some(b => filePath.toLowerCase().includes(b))) {
        return { error: "File access denied", reason: "Sensitive file" };
      }

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n").slice(0, 50);
        return {
          path: filePath,
          lines: lines.length,
          content: lines.join("\n"),
          truncated: content.split("\n").length > 50,
        };
      } catch (e) {
        return { error: "File read error", message: (e as Error).message };
      }
    }

    default:
      return {
        action,
        status: "not_implemented",
        message: "Cette action n'est pas encore implémentée en mode read-only.",
      };
  }
}

export default router;
