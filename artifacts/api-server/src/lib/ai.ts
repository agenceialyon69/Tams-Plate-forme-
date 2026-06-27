/**
 * Free, OpenAI-compatible AI client (no proprietary SDK).
 *
 * Free-first (constitution 36_FREE_STACK): talks to ANY OpenAI-compatible
 * endpoint via fetch — Ollama (local), Groq, Gemini (free quota), OpenRouter
 * (free models). No paid dependency, no `openai` package, no default to
 * api.openai.com. Degrades gracefully when nothing is configured.
 *
 * Config (env):
 *   AI_BASE_URL   e.g. http://localhost:11434/v1 (Ollama) | https://api.groq.com/openai/v1
 *   AI_API_KEY    optional bearer token (local Ollama needs none)
 *   AI_MODEL      optional override applied to every request
 * Backward-compatible fallbacks: AI_GATEWAY_URL, REPLIT_AI_API_KEY.
 */

function baseUrl(): string {
  return (process.env.AI_BASE_URL || process.env.AI_GATEWAY_URL || "").replace(/\/$/, "");
}
function apiKey(): string {
  return process.env.AI_API_KEY || process.env.REPLIT_AI_API_KEY || "";
}

/** True when an AI endpoint is configured (otherwise callers must fall back). */
export function aiConfigured(): boolean {
  return Boolean(baseUrl());
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const k = apiKey();
  if (k) h.Authorization = `Bearer ${k}`;
  return h;
}

function withModel<T extends Record<string, unknown>>(body: T): T {
  return process.env.AI_MODEL ? { ...body, model: process.env.AI_MODEL } : body;
}

/** Non-streaming chat completion. Returns the OpenAI-compatible JSON response. */
export async function aiChat(body: Record<string, unknown>): Promise<any> {
  const url = baseUrl();
  if (!url) throw new Error("AI_NOT_CONFIGURED");
  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(withModel({ ...body, stream: false })),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`AI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return res.json();
}

/** Streaming chat completion. Yields OpenAI-compatible SSE chunk objects. */
export async function* aiChatStream(body: Record<string, unknown>): AsyncGenerator<any> {
  const url = baseUrl();
  if (!url) throw new Error("AI_NOT_CONFIGURED");
  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(withModel({ ...body, stream: true })),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`AI ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        /* ignore partial/non-JSON keepalive lines */
      }
    }
  }
}
