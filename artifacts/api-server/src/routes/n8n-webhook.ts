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

const mediaKinds = new Set(["video", "audio", "voice", "image"]);

async function testWebhook(url: string): Promise<{ status: string; latency?: number; error?: string }> {
  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    if (response.ok || response.status === 401 || response.status === 403 || response.status === 405) {
      return { status: "ok", latency };
    }
    return { status: "failed", error: `HTTP ${response.status}` };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { status: "timeout" };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

router.get("/n8n/status", async (_req, res) => {
  const url = n8nUrl();

  if (!url) {
    return res.json({
      ok: true,
      configured: false,
      status: "missing_config",
      env: "N8N_WEBHOOK_URL",
      note: "Set N8N_WEBHOOK_URL to enable n8n automation.",
    });
  }

  const testResult = await testWebhook(url);

  if (testResult.status === "ok") {
    return res.json({
      ok: true,
      configured: true,
      status: "connected",
      verified: true,
      latency: testResult.latency,
      note: "n8n webhook endpoint is reachable. POST task output is still verified by /api/n8n/send.",
    });
  }

  return res.json({
    ok: true,
    configured: true,
    status: "failed",
    verified: false,
    error: testResult.error,
    note: "N8N_WEBHOOK_URL is set but webhook is not responding. Check if n8n workflow is active.",
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
  const kind = String(body?.kind || "video");
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

    if (!response.ok || data.ok === false) {
      return res.status(response.ok ? 502 : response.status).json({
        ok: false,
        error: String(data.error || data.detail || `n8n_http_${response.status}`),
        n8nResponse: data,
      });
    }

    const resultUrl = typeof data.url === "string" ? data.url : typeof data.artifactUrl === "string" ? data.artifactUrl : undefined;
    if (mediaKinds.has(kind) && !resultUrl) {
      return res.status(502).json({
        ok: false,
        error: "n8n returned ok:true but no media URL. Refusing fake success.",
        n8nResponse: data,
      });
    }

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
