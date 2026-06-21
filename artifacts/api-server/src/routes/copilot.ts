import { Router, type IRouter } from "express";
import { copilotChat, type CopilotMessage } from "../lib/ai";
import { checkAndIncrementAiCalls } from "./quotas";

const router: IRouter = Router();

/** POST /api/copilot/chat — conversational AI copilot. */
router.post("/copilot/chat", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { messages?: unknown };
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

  const reply = await copilotChat(messages);
  res.json({ reply });
});

export default router;
