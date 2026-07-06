/**
 * AGENT CHAT — le Chat "niveau Claude" (boucle agentique free-first).
 *
 * POST /api/agent/chat
 *   body: { message: string, history?: {role,content}[] }
 *   -> { ok, message, steps: [{tool,input,output}] }
 *
 * Sous /api => protégé par le gate admin. Sans clé IA free-first configurée,
 * renvoie un 503 honnête (jamais de fausse réponse).
 */
import { Router } from "express";
import { aiConfigured } from "../lib/ai.js";
import { runAgentChat, type AgentTurnMessage } from "../lib/agent-runtime.js";

const router = Router();

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sanitizeHistory(raw: unknown): AgentTurnMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentTurnMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content });
    }
  }
  return out.slice(-12);
}

router.post("/agent/chat", async (req, res) => {
  const b = (typeof req.body === "object" && req.body) ? req.body as Record<string, unknown> : {};
  const message = str(b.message).trim();
  if (!message) return res.status(400).json({ ok: false, error: "paramètre 'message' requis" });

  if (!aiConfigured()) {
    return res.status(503).json({
      ok: false,
      code: "AI_NOT_CONFIGURED",
      error: "IA non configurée. Ajoute une clé gratuite sur Railway (GROQ_API_KEY ou GEMINI_API_KEY) pour activer l'agent.",
    });
  }

  try {
    const result = await runAgentChat(sanitizeHistory(b.history), message);
    return res.json({ ok: true, message: result.message, steps: result.steps });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "AI_NOT_CONFIGURED") {
      return res.status(503).json({ ok: false, code: "AI_NOT_CONFIGURED", error: "IA non configurée." });
    }
    return res.status(502).json({ ok: false, error: `Agent indisponible : ${msg}` });
  }
});

export default router;
