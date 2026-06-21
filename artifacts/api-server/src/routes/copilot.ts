import { Router, type IRouter } from "express";
import { copilotChat, type CopilotMessage } from "../lib/ai";
import { listProducts } from "../lib/products";
import { searchWeb, formatResultsForPrompt, searchProviders } from "../lib/integrations/web-search";
import { trackCopilotMessage } from "../lib/events";
import { checkAndIncrementAiCalls } from "./quotas";

const router: IRouter = Router();

/** POST /api/copilot/chat — conversational AI copilot. */
router.post("/copilot/chat", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { messages?: unknown; productId?: unknown; webSearch?: unknown };
  const productId = typeof body.productId === "string" ? body.productId : null;
  const wantWeb = body.webSearch === true;
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

  trackCopilotMessage({
    userId: req.authUser?.id,
    tenantId: req.tenantId,
    productId,
    webSearch: wantWeb,
    req,
  });

  res.json({ reply, sources });
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

export default router;
