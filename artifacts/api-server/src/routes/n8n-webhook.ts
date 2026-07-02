import { Router } from "express";

const router = Router();

function n8nUrl(): string | null {
  const url = process.env.N8N_WEBHOOK_URL;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

interface N8nPayload {
  kind: "video" | "audio" | "voice" | "vision" | "image" | string;
  prompt: string;
  input?: Record<string, unknown>;
  callbackUrl?: string;
  source?: string;
}

interface N8nResponse {
  ok: boolean;
  url?: string;
  provider?: string;
  logs?: string[];
  error?: string;
}

router.get("/n8n/status", (_req, res) => {
  const url = n8nUrl();
  return res.json({
    ok: true,
    configured: Boolean(url),
    status: url ? "connected" : "missing_config",
    env: "N8N_WEBHOOK_URL",
    note: url
      ? "n8n webhook is configured. TAMS can send video/audio/voice/vision tasks."
      : "Set N8N_WEBHOOK_URL to enable n8n automation.",
  });
});

router.post("/n8n/send", async (req, res) => {
  const url = n8nUrl();
  if (!url) {
    return res.status(503).json({
      ok: false,
      error: "N8N_WEBHOOK_URL not configured",
      missingConfig: true,
      requiredEnv: "N8N_WEBHOOK_URL",
    });
  }

  const body = req.body as Partial<N8nPayload>;
  const kind = body?.kind || "video";
  const prompt = body?.prompt?.trim();

  if (!prompt) {
    return res.status(400).json({ ok: false, error: "prompt is required" });
  }

  const payload: N8nPayload = {
    kind,
    prompt,
    input: body.input || {},
    callbackUrl: body.callbackUrl,
    source: "tams",
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: String(data.error || data.detail || `n8n_http_${response.status}`),
        n8nResponse: data,
      });
    }

    const resultUrl = typeof data.url === "string" ? data.url : undefined;

    return res.json({
      ok: true,
      url: resultUrl,
      provider: "n8n",
      engine: "n8n_workflow",
      logs: Array.isArray(data.logs) ? data.logs : undefined,
      n8nResponse: data,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
