import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

/**
 * Multi-provider LLM gateway.
 *
 * Goal: let the app use FREE / self-hosted models interchangeably without
 * touching call sites. Each provider is isolated and only activates when its
 * credentials/URL are present (feature-flagged via env). The gateway picks an
 * ordered list of configured providers and falls back to the next one on
 * failure, so a missing key or a down local server never breaks a feature.
 *
 * Providers:
 *  - gemini  : Google Gemini (free tier)         → GEMINI_API_KEY
 *  - groq    : Groq cloud (free tier, Llama/Qwen) → GROQ_API_KEY
 *  - ollama  : local server (Llama/Qwen/DeepSeek) → OLLAMA_BASE_URL
 *
 * Selection is controlled by AI_PROVIDER ("auto" by default). In "auto" mode
 * the order is gemini → groq → ollama, restricted to configured providers.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatResult {
  /** The assistant reply text. */
  text: string;
  /** Which provider produced the reply (for observability/UI). */
  provider: string;
}

export interface ChatOptions {
  /** System instruction guiding the assistant. */
  system?: string;
  /** Soft cap on generated tokens where the provider supports it. */
  maxTokens?: number;
  /** Sampling temperature (0–1). */
  temperature?: number;
}

interface Provider {
  readonly name: string;
  isConfigured(): boolean;
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<string>;
}

function clamp(s: unknown, max = 4000): string {
  return typeof s === "string" ? s.slice(0, max) : "";
}

// --- Gemini -----------------------------------------------------------------

const geminiProvider: Provider = {
  name: "gemini",
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
  async chat(messages, opts) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      systemInstruction: opts.system,
    });
    const last = messages[messages.length - 1];
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last.content);
    return result.response.text().trim();
  },
};

// --- Groq (OpenAI-compatible) ----------------------------------------------

let groqClient: Groq | null = null;
const groqProvider: Provider = {
  name: "groq",
  isConfigured: () => Boolean(process.env.GROQ_API_KEY),
  async chat(messages, opts) {
    if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const payload = [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const completion = await groqClient.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: payload,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 1024,
    });
    return (completion.choices[0]?.message?.content ?? "").trim();
  },
};

// --- Ollama (local, OpenAI-compatible /api/chat) ----------------------------

const ollamaProvider: Provider = {
  name: "ollama",
  isConfigured: () => Boolean(process.env.OLLAMA_BASE_URL),
  async chat(messages, opts) {
    const base = (process.env.OLLAMA_BASE_URL ?? "").replace(/\/$/, "");
    const payload = [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.2",
        messages: payload,
        stream: false,
        options: { temperature: opts.temperature ?? 0.6 },
      }),
      // Local models can be slow; keep a generous but bounded timeout.
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`Ollama responded ${res.status}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return (data.message?.content ?? "").trim();
  },
};

const ALL_PROVIDERS: Record<string, Provider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  ollama: ollamaProvider,
};

// Order used in "auto" mode. Cloud free tiers first (zero setup), local last.
const AUTO_ORDER = ["gemini", "groq", "ollama"] as const;

/** Resolve the ordered list of providers to try, based on env + config. */
function resolveProviders(): Provider[] {
  const pref = (process.env.AI_PROVIDER || "auto").toLowerCase().trim();

  if (pref !== "auto" && ALL_PROVIDERS[pref]) {
    // Explicit choice first, then the others as fallback (configured only).
    const chosen = ALL_PROVIDERS[pref];
    const rest = AUTO_ORDER.map((n) => ALL_PROVIDERS[n]).filter(
      (p) => p.name !== pref && p.isConfigured()
    );
    return [chosen, ...rest].filter((p) => p.isConfigured());
  }

  return AUTO_ORDER.map((n) => ALL_PROVIDERS[n]).filter((p) => p.isConfigured());
}

/** True if at least one provider is configured. */
export function hasLlmProvider(): boolean {
  return resolveProviders().length > 0;
}

/** Names of currently configured providers (for diagnostics/UI). */
export function configuredProviders(): string[] {
  return Object.values(ALL_PROVIDERS)
    .filter((p) => p.isConfigured())
    .map((p) => p.name);
}

/**
 * Run a chat completion through the first working provider. Tries each
 * configured provider in order and falls back on error. Throws only when no
 * provider is configured or all of them fail.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  const trimmed = messages
    .map((m) => ({ role: m.role, content: clamp(m.content, 8000) }))
    .filter((m) => m.content.length > 0);

  if (trimmed.length === 0) {
    throw new Error("No message content provided");
  }

  const providers = resolveProviders();
  if (providers.length === 0) {
    throw new Error("No LLM provider configured");
  }

  let lastErr: unknown = null;
  for (const provider of providers) {
    try {
      const text = await provider.chat(trimmed, opts);
      if (text) return { text, provider: provider.name };
      lastErr = new Error(`${provider.name} returned empty response`);
    } catch (err) {
      lastErr = err;
      logger.warn({ err, provider: provider.name }, "LLM provider failed, trying next");
    }
  }
  throw lastErr ?? new Error("All LLM providers failed");
}
