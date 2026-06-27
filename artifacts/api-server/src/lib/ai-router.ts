/**
 * Unified AI Router
 *
 * Automatically selects the best model based on:
 * - Task type (chat, reasoning, creative, code, analysis)
 * - Cost (always prefer free)
 * - Speed/latency
 * - Quality requirements
 * - Context size
 *
 * Supported providers (in priority order for free usage):
 * 1. Replit AI Gateway (Gemini Flash) - free via Replit
 * 2. Ollama Local (Qwen, DeepSeek, Gemma, Llama) - completely free
 * 3. Groq API - fast free tier
 * 4. OpenRouter - free models
 * 5. Google AI Studio - Gemini free tier
 */

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AICapability =
  | "fast_chat"      // Quick responses, simple queries
  | "reasoning"      // Complex analysis, multi-step thinking
  | "creative"       // Content generation, writing
  | "code"           // Code generation, debugging
  | "analysis"       // Data analysis, summarization
  | "tools"          // Function calling
  | "long_context";  // Needs 100k+ tokens

export type AIProvider = "replit" | "ollama" | "groq" | "openrouter" | "google";

export interface ModelConfig {
  id: string;
  provider: AIProvider;
  model: string;
  baseURL: string;
  maxTokens: number;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJSON: boolean;
  costPerMillion: number;  // 0 = free
  avgLatencyMs: number;
  qualityScore: number;    // 1-10
  capabilities: AICapability[];
}

export interface RoutingDecision {
  model: ModelConfig;
  reason: string;
  fallbackChain: ModelConfig[];
}

// ─── Available Models ──────────────────────────────────────────────────────────

const MODELS: ModelConfig[] = [
  // ─── Replit AI Gateway (Primary - Free) ─────────────────────────────────────
  {
    id: "gemini-2.5-flash",
    provider: "replit",
    model: "google/gemini-2.5-flash",
    baseURL: process.env.AI_GATEWAY_URL || "https://api.replit.com/v1",
    maxTokens: 4000,
    contextWindow: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: true,
    costPerMillion: 0,
    avgLatencyMs: 800,
    qualityScore: 8,
    capabilities: ["fast_chat", "reasoning", "creative", "code", "analysis", "tools", "long_context"],
  },

  // ─── Ollama Local (Free - if running) ───────────────────────────────────────
  {
    id: "ollama-qwen3",
    provider: "ollama",
    model: "qwen3:8b",
    baseURL: "http://localhost:11434/v1",
    maxTokens: 4000,
    contextWindow: 32000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: false,
    costPerMillion: 0,
    avgLatencyMs: 400,
    qualityScore: 7,
    capabilities: ["fast_chat", "reasoning", "creative", "code", "tools"],
  },
  {
    id: "ollama-deepseek-r1",
    provider: "ollama",
    model: "deepseek-r1:7b",
    baseURL: "http://localhost:11434/v1",
    maxTokens: 4000,
    contextWindow: 32000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: false,
    costPerMillion: 0,
    avgLatencyMs: 600,
    qualityScore: 8,
    capabilities: ["reasoning", "code", "analysis"],
  },
  {
    id: "ollama-gemma3",
    provider: "ollama",
    model: "gemma3:4b",
    baseURL: "http://localhost:11434/v1",
    maxTokens: 2000,
    contextWindow: 8000,
    supportsTools: false,
    supportsStreaming: true,
    supportsJSON: false,
    costPerMillion: 0,
    avgLatencyMs: 200,
    qualityScore: 6,
    capabilities: ["fast_chat", "creative"],
  },

  // ─── Groq (Fast Free Tier) ───────────────────────────────────────────────────
  {
    id: "groq-llama",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    baseURL: "https://api.groq.com/openai/v1",
    maxTokens: 4000,
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: true,
    costPerMillion: 0,
    avgLatencyMs: 150,
    qualityScore: 8,
    capabilities: ["fast_chat", "reasoning", "creative", "code", "tools"],
  },
  {
    id: "groq-deepseek",
    provider: "groq",
    model: "deepseek-r1-distill-llama-70b",
    baseURL: "https://api.groq.com/openai/v1",
    maxTokens: 4000,
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: false,
    costPerMillion: 0,
    avgLatencyMs: 200,
    qualityScore: 9,
    capabilities: ["reasoning", "code", "analysis"],
  },

  // ─── OpenRouter (Free Models) ───────────────────────────────────────────────
  {
    id: "openrouter-deepseek-r1",
    provider: "openrouter",
    model: "deepseek/deepseek-r1-0528:free",
    baseURL: "https://openrouter.ai/api/v1",
    maxTokens: 4000,
    contextWindow: 64000,
    supportsTools: false,
    supportsStreaming: true,
    supportsJSON: false,
    costPerMillion: 0,
    avgLatencyMs: 2000,
    qualityScore: 9,
    capabilities: ["reasoning", "code", "analysis", "long_context"],
  },
  {
    id: "openrouter-gemma3",
    provider: "openrouter",
    model: "google/gemma-3-27b-it:free",
    baseURL: "https://openrouter.ai/api/v1",
    maxTokens: 4000,
    contextWindow: 32000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: false,
    costPerMillion: 0,
    avgLatencyMs: 1500,
    qualityScore: 7,
    capabilities: ["fast_chat", "creative", "tools"],
  },

  // ─── Google AI Studio (Free Tier) ───────────────────────────────────────────
  {
    id: "google-gemini-2.0-flash",
    provider: "google",
    model: "gemini-2.0-flash",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    maxTokens: 4000,
    contextWindow: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsJSON: true,
    costPerMillion: 0,
    avgLatencyMs: 600,
    qualityScore: 8,
    capabilities: ["fast_chat", "reasoning", "creative", "code", "tools", "long_context"],
  },
];

// ─── Provider Health Status ────────────────────────────────────────────────────

interface ProviderHealth {
  provider: AIProvider;
  available: boolean;
  lastCheck: number;
  latencyMs: number | null;
  errorCount: number;
}

const providerHealth: Map<AIProvider, ProviderHealth> = new Map();

export async function checkProviderHealth(): Promise<Map<AIProvider, ProviderHealth>> {
  const checks = await Promise.allSettled([
    // Check Replit Gateway
    checkReplitHealth(),
    // Check Ollama
    checkOllamaHealth(),
    // Check Groq
    Promise.resolve({ provider: "groq" as const, available: !!process.env.GROQ_API_KEY, latencyMs: undefined as number | undefined }),
    // Check OpenRouter
    Promise.resolve({ provider: "openrouter" as const, available: !!process.env.OPENROUTER_API_KEY, latencyMs: undefined as number | undefined }),
    // Check Google
    Promise.resolve({ provider: "google" as const, available: !!process.env.GOOGLE_API_KEY, latencyMs: undefined as number | undefined }),
  ]);

  for (const result of checks) {
    if (result.status === "fulfilled") {
      const { provider, available, latencyMs } = result.value;
      providerHealth.set(provider, {
        provider,
        available,
        lastCheck: Date.now(),
        latencyMs: latencyMs ?? null,
        errorCount: 0,
      });
    }
  }

  return providerHealth;
}

async function checkReplitHealth(): Promise<{ provider: AIProvider; available: boolean; latencyMs?: number }> {
  if (!process.env.AI_GATEWAY_URL || !process.env.REPLIT_AI_API_KEY) {
    return { provider: "replit", available: false };
  }
  return { provider: "replit", available: true };
}

async function checkOllamaHealth(): Promise<{ provider: AIProvider; available: boolean; latencyMs?: number }> {
  try {
    const start = Date.now();
    const res = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return { provider: "ollama", available: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { provider: "ollama", available: false };
  }
}

// ─── Model Selection ──────────────────────────────────────────────────────────

export function selectModel(
  task: AICapability,
  requirements: {
    needsTools?: boolean;
    needsJSON?: boolean;
    needsStreaming?: boolean;
    contextTokens?: number;
    preferSpeed?: boolean;
    preferQuality?: boolean;
  } = {}
): RoutingDecision {
  const { needsTools, needsJSON, needsStreaming, contextTokens, preferSpeed, preferQuality } = requirements;

  // Filter models by availability and requirements
  const candidates = MODELS.filter(m => {
    // Check if provider is available
    const health = providerHealth.get(m.provider);
    if (health && !health.available) return false;

    // Check capability match
    if (!m.capabilities.includes(task)) return false;

    // Check requirements
    if (needsTools && !m.supportsTools) return false;
    if (needsJSON && !m.supportsJSON) return false;
    if (needsStreaming && !m.supportsStreaming) return false;
    if (contextTokens && m.contextWindow < contextTokens) return false;

    return true;
  });

  if (candidates.length === 0) {
    // Fallback to first available model
    const fallback = MODELS[0];
    return {
      model: fallback,
      reason: "No ideal match, using default fallback",
      fallbackChain: [],
    };
  }

  // Sort by priority
  const sorted = candidates.sort((a, b) => {
    // Always prefer free models
    if (a.costPerMillion === 0 && b.costPerMillion > 0) return -1;
    if (b.costPerMillion === 0 && a.costPerMillion > 0) return 1;

    // If speed preferred, prioritize low latency
    if (preferSpeed) return a.avgLatencyMs - b.avgLatencyMs;

    // If quality preferred, prioritize quality score
    if (preferQuality) return b.qualityScore - a.qualityScore;

    // Default: balance quality and speed
    const aScore = a.qualityScore * 1000 / a.avgLatencyMs;
    const bScore = b.qualityScore * 1000 / b.avgLatencyMs;
    return bScore - aScore;
  });

  const selected = sorted[0];
  const fallbackChain = sorted.slice(1, 3);

  return {
    model: selected,
    reason: `Selected ${selected.id} for ${task} task (${preferSpeed ? "speed" : preferQuality ? "quality" : "balanced"} priority)`,
    fallbackChain,
  };
}

// ─── Client Creation ──────────────────────────────────────────────────────────

export function createClient(model: ModelConfig): {
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
} {
  const apiKeys: Record<AIProvider, string> = {
    replit: process.env.REPLIT_AI_API_KEY || "placeholder",
    ollama: "ollama",  // Ollama doesn't need a real key
    groq: process.env.GROQ_API_KEY || "",
    openrouter: process.env.OPENROUTER_API_KEY || "",
    google: process.env.GOOGLE_API_KEY || "",
  };

  const headers: Record<string, string> | undefined = model.provider === "openrouter"
    ? { "HTTP-Referer": "https://tams.local", "X-Title": "TAMS AI OS" }
    : undefined;

  return {
    baseURL: model.baseURL,
    apiKey: apiKeys[model.provider],
    model: model.model,
    headers,
  };
}

// ─── Completion Helper ───────────────────────────────────────────────────────

import { aiChat } from "./ai";

export async function smartCompletion(
  task: AICapability,
  messages: ChatMessage[],
  options: {
    maxTokens?: number;
    needsTools?: boolean;
    needsJSON?: boolean;
    needsStreaming?: boolean;
    tools?: any[];
  } = {}
): Promise<{ content: string; model: string; latencyMs: number }> {
  const { maxTokens = 2000, needsTools, needsJSON, needsStreaming, tools } = options;

  const routing = selectModel(task, {
    needsTools: needsTools || !!tools,
    needsJSON,
    needsStreaming,
  });

  const client = createClient(routing.model);

  const start = Date.now();

  const body: Record<string, unknown> = {
    model: client.model,
    messages,
    max_tokens: maxTokens,
  };
  if (tools && routing.model.supportsTools) body.tools = tools;
  if (needsJSON && routing.model.supportsJSON) body.response_format = { type: "json_object" };

  try {
    const completion = await aiChat(body);
    const content = completion.choices?.[0]?.message?.content || "";

    return {
      content,
      model: routing.model.id,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    // Try fallback models
    for (const fallback of routing.fallbackChain) {
      try {
        const fallbackClient = createClient(fallback);
        const fallbackBody = {
          model: fallbackClient.model,
          messages,
          max_tokens: maxTokens,
        };

        const completion = await aiChat(fallbackBody);

        return {
          content: completion.choices?.[0]?.message?.content || "",
          model: fallback.id,
          latencyMs: Date.now() - start,
        };
      } catch {
        // Continue to next fallback
      }
    }

    throw err;
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

export { MODELS };
