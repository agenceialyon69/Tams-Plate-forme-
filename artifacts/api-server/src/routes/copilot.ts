import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, copilotMessagesTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { copilotChat, type CopilotMessage } from "../lib/ai";
import { listProducts } from "../lib/products";
import { searchWeb, formatResultsForPrompt, searchProviders } from "../lib/integrations/web-search";
import { analyzeFile, generateAuditprompt, type AnalyzedFile } from "../lib/file-analyzer";
import { trackCopilotMessage } from "../lib/events";
import { logger } from "../lib/logger";
import { checkAndIncrementAiCalls } from "./quotas";

const router: IRouter = Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
  "text/plain", "text/markdown", "text/csv",
  "application/json",
];

/** POST /api/copilot/chat — conversational AI copilot. */
router.post("/copilot/chat", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { messages?: unknown; productId?: unknown; webSearch?: unknown; conversationId?: unknown };
  const productId = typeof body.productId === "string" ? body.productId : null;
  const wantWeb = body.webSearch === true;
  // Memory: keep the thread id stable so the conversation persists across
  // sessions/devices. A fresh id starts a new conversation.
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim() ? body.conversationId : randomUUID();
  const raw = Array.isArray(body.messages) ? body.messages : [];

  const messages: CopilotMessage[] = raw
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
    .map((m): CopilotMessage => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : "",
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-20);

  if (messages.length === 0) {
    res.status(400).json({ error: "Message requis." });
    return;
  }

  // AI cost guardrail (per tenant), like the other AI endpoints.
  const tenantId = req.tenantId;
  if (tenantId) {
    const guard = await checkAndIncrementAiCalls(tenantId, {
      userId: req.authUser?.id,
      route: "copilot/chat",
    });
    if (!guard.allowed) {
      res.status(429).json({ error: "Quota IA atteint. Réessaie plus tard.", detail: guard.reason });
      return;
    }
  }

  // Optional web grounding: search on the last user message and inject results.
  let webContext: string | null = null;
  let sources: Array<{ title: string; url: string }> = [];
  if (wantWeb) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const { results } = await searchWeb(lastUser.content, 5);
      webContext = formatResultsForPrompt(results);
      sources = results.map((r) => ({ title: r.title, url: r.url })).filter((s) => s.url);
    }
  }

  const reply = await copilotChat(messages, productId, webContext);

  // Persist this turn (last user message + reply) so the Copilot remembers.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (req.authUser?.id) {
    db.insert(copilotMessagesTable)
      .values([
        ...(lastUser
          ? [{
              conversationId,
              userId: req.authUser.id,
              tenantId: req.tenantId ?? null,
              productId,
              role: "user" as const,
              content: lastUser.content.slice(0, 8000),
            }]
          : []),
        {
          conversationId,
          userId: req.authUser.id,
          tenantId: req.tenantId ?? null,
          productId,
          role: "assistant" as const,
          content: reply.slice(0, 12000),
        },
      ])
      .catch((err) => logger.error({ err }, "Failed to persist copilot message"));
  }

  trackCopilotMessage({
    userId: req.authUser?.id,
    tenantId: req.tenantId,
    productId,
    webSearch: wantWeb,
    req,
  });

  res.json({ reply, sources, conversationId });
});

/** GET /api/copilot/conversations — list the user's saved conversations. */
router.get("/copilot/conversations", async (req, res): Promise<void> => {
  const userId = req.authUser?.id;
  if (!userId) {
    res.json({ conversations: [] });
    return;
  }
  try {
    // One row per conversation: title (first message), last activity, count.
    const rows = await db
      .select({
        conversationId: copilotMessagesTable.conversationId,
        title: sql<string>`(array_agg(${copilotMessagesTable.content} ORDER BY ${copilotMessagesTable.createdAt} ASC))[1]`,
        updatedAt: sql<string>`max(${copilotMessagesTable.createdAt})`,
        count: sql<number>`count(*)::int`,
      })
      .from(copilotMessagesTable)
      .where(eq(copilotMessagesTable.userId, userId))
      .groupBy(copilotMessagesTable.conversationId)
      .orderBy(desc(sql`max(${copilotMessagesTable.createdAt})`))
      .limit(50);
    res.json({
      conversations: rows.map((r) => ({
        conversationId: r.conversationId,
        title: (r.title ?? "Conversation").slice(0, 80),
        updatedAt: r.updatedAt,
        count: r.count,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Lecture des conversations impossible." });
  }
});

/** GET /api/copilot/conversations/:id — messages of one conversation. */
router.get("/copilot/conversations/:id", async (req, res): Promise<void> => {
  const userId = req.authUser?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  try {
    const rows = await db
      .select({ role: copilotMessagesTable.role, content: copilotMessagesTable.content })
      .from(copilotMessagesTable)
      .where(and(eq(copilotMessagesTable.userId, userId), eq(copilotMessagesTable.conversationId, String(req.params.id))))
      .orderBy(copilotMessagesTable.createdAt)
      .limit(200);
    res.json({ messages: rows });
  } catch (err) {
    logger.error({ err }, "Failed to load conversation");
    res.status(500).json({ error: "Lecture de la conversation impossible." });
  }
});

/** DELETE /api/copilot/conversations/:id — forget a conversation. */
router.delete("/copilot/conversations/:id", async (req, res): Promise<void> => {
  const userId = req.authUser?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  try {
    await db
      .delete(copilotMessagesTable)
      .where(and(eq(copilotMessagesTable.userId, userId), eq(copilotMessagesTable.conversationId, String(req.params.id))));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Suppression impossible." });
  }
});

/** GET /api/web-search/status — which web-search providers are available. */
router.get("/web-search/status", (_req, res): void => {
  res.json({ configured: true, providers: searchProviders() });
});

/** POST /api/web-search — raw web search (owner can use it directly). */
router.post("/web-search", async (req, res): Promise<void> => {
  const q = typeof (req.body as { query?: unknown })?.query === "string" ? (req.body as { query: string }).query : "";
  if (!q.trim()) {
    res.status(400).json({ error: "Requête requise." });
    return;
  }
  const { results, provider } = await searchWeb(q, 6);
  res.json({ results, provider });
});

/** GET /api/products — verticals (personas) available in this deployment. */
router.get("/products", (_req, res): void => {
  res.json({
    products: listProducts().map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      suggestions: p.suggestions,
    })),
  });
});

/** POST /api/copilot/audit — analyze uploaded files in Red Team mode. */
router.post("/copilot/audit", async (req, res): Promise<void> => {
  const userId = req.authUser?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }

  const body = req.body as {
    files?: Array<{ filename: string; mimetype: string; data: string }>;
    context?: string;
  };

  const rawFiles = Array.isArray(body.files) ? body.files : [];
  if (rawFiles.length === 0) {
    res.status(400).json({ error: "Au moins un fichier est requis." });
    return;
  }

  if (rawFiles.length > 5) {
    res.status(400).json({ error: "Maximum 5 fichiers par analyse." });
    return;
  }

  const analyzedFiles: AnalyzedFile[] = [];
  const errors: string[] = [];

  for (const f of rawFiles) {
    if (!f.filename || !f.mimetype || !f.data) {
      errors.push("Fichier incomplet");
      continue;
    }

    if (!ALLOWED_MIME_TYPES.includes(f.mimetype) && !f.mimetype.startsWith("text/")) {
      errors.push(`Type non supporté: ${f.mimetype}`);
      continue;
    }

    try {
      const buffer = Buffer.isBuffer(f.data)
        ? f.data
        : Buffer.from(f.data, "base64");

      if (buffer.length > MAX_FILE_SIZE) {
        errors.push(`${f.filename}: trop volumineux (max 25 Mo)`);
        continue;
      }

      const analyzed = await analyzeFile(buffer, f.filename, f.mimetype);
      analyzedFiles.push(analyzed);
    } catch (err) {
      logger.error({ err, filename: f.filename }, "Failed to analyze file");
      errors.push(`${f.filename}: erreur d'analyse`);
    }
  }

  if (analyzedFiles.length === 0) {
    res.status(400).json({ error: "Aucun fichier valide à analyser.", details: errors });
    return;
  }

  const tenantId = req.tenantId;
  if (tenantId) {
    const guard = await checkAndIncrementAiCalls(tenantId, {
      userId: req.authUser?.id,
      route: "copilot/audit",
    });
    if (!guard.allowed) {
      res.status(429).json({ error: "Quota IA atteint.", detail: guard.reason });
      return;
    }
  }

  const auditPrompt = generateAuditprompt(analyzedFiles, body.context);
  const messages: CopilotMessage[] = [
    { role: "user", content: auditPrompt },
  ];

  const reply = await copilotChat(messages, "tams", null);

  trackCopilotMessage({
    userId,
    tenantId,
    productId: "audit",
    webSearch: false,
    req,
  });

  res.json({
    reply,
    files: analyzedFiles.map((f) => ({
      filename: f.filename,
      type: f.type,
      size: f.size,
      risks: f.risks,
    })),
    errors: errors.length > 0 ? errors : undefined,
  });
});

export default router;
