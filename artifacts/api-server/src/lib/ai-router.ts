/**
 * AI Router
 * Routes requests to the best available free AI model
 */

export type AITaskType =
  | "chat"          // General conversation
  | "briefing"      // Quick, structured output
  | "decision"      // Complex reasoning
  | "red_team"      // Critical analysis
  | "creative"      // Content generation
  | "analysis"      // Data analysis
  | "embedding"     // Vector embeddings
  | "transcription" // Audio to text
  | "image";        // Image generation

export type AIProvider =
  | "replit_gateway"  // Replit AI Gateway (Gemini Flash)
  | "ollama"          // Local Ollama (Qwen, DeepSeek, etc.)
  | "openrouter";     // OpenRouter free models

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  baseURL?: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  costPerToken: number;  // In credits (0 = free)
  avgLatencyMs: number;  // Average response time
}

// Available free models
const MODEL_CONFIGS: Record<string, AIModelConfig> = {
  // Replit AI Gateway - primary (free via Replit)
  "gemini-2.5-flash": {
    provider: "replit_gateway",
    model: "google/gemini-2.5-flash",
    baseURL: process.env.AI_GATEWAY_URL,
    maxTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    costPerToken: 0,
    avgLatencyMs: 800,
  },
  // Local Ollama - completely free
  "ollama-qwen3": {
    provider: "ollama",
    model: "qwen3:8b",
    baseURL: "http://localhost:11434/v1",
    maxTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    costPerToken: 0,
    avgLatencyMs: 500,
  },
  "ollama-deepseek": {
    provider: "ollama",
    model: "deepseek-r1:7b",
    baseURL: "http://localhost:11434/v1",
    maxTokens: 4000,
    supportsStreaming: true,
    supportsTools: true,
    costPerToken: 0,
    avgLatencyMs: 600,
  },
  // OpenRouter free models
  "openrouter-deepseek": {
    provider: "openrouter",
    model: "deepseek/deepseek-r1-0528:free",
    baseURL: "https://openrouter.ai/api/v1",
    maxTokens: 4000,
    supportsStreaming: true,
    supportsTools: false,
    costPerToken: 0,
    avgLatencyMs: 1500,
  },
};

/**
 * Route AI request to the best available model
 */
export function routeAI(taskType: AITaskType): AIModelConfig {
  // Check if Ollama is available locally
  const ollamaAvailable = process.env.OLLAMA_HOST || false;

  // Priority based on task type
  switch (taskType) {
    case "briefing":
      // Fast, structured output - Gemini Flash is ideal
      return MODEL_CONFIGS["gemini-2.5-flash"];

    case "decision":
    case "red_team":
      // Complex reasoning - prefer DeepSeek R1 if available
      if (ollamaAvailable) {
        return MODEL_CONFIGS["ollama-deepseek"];
      }
      return MODEL_CONFIGS["gemini-2.5-flash"];

    case "creative":
      // Creative tasks - Qwen is good
      if (ollamaAvailable) {
        return MODEL_CONFIGS["ollama-qwen3"];
      }
      return MODEL_CONFIGS["gemini-2.5-flash"];

    case "analysis":
      // Deep analysis - DeepSeek or Gemini
      if (ollamaAvailable) {
        return MODEL_CONFIGS["ollama-deepseek"];
      }
      return MODEL_CONFIGS["gemini-2.5-flash"];

    case "embedding":
      // TODO: Add embedding models
      return MODEL_CONFIGS["gemini-2.5-flash"];

    case "transcription":
      // TODO: Whisper local
      throw new Error("Transcription requires Whisper - not yet implemented");

    case "image":
      // TODO: ComfyUI/Stable Diffusion local
      throw new Error("Image generation requires ComfyUI - not yet implemented");

    case "chat":
    default:
      // Default: Gemini Flash (free, fast, good)
      return MODEL_CONFIGS["gemini-2.5-flash"];
  }
}

/**
 * Get OpenAI-compatible client for the selected model
 */
export function getAIClient(config: AIModelConfig): {
  baseURL: string;
  apiKey: string;
  model: string;
} {
  switch (config.provider) {
    case "replit_gateway":
      return {
        baseURL: process.env.AI_GATEWAY_URL || "https://api.replit.com/v1",
        apiKey: process.env.REPLIT_AI_API_KEY || "placeholder",
        model: config.model,
      };

    case "ollama":
      return {
        baseURL: config.baseURL || "http://localhost:11434/v1",
        apiKey: "ollama", // Ollama doesn't need a real key
        model: config.model,
      };

    case "openrouter":
      return {
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY || "",
        model: config.model,
      };

    default:
      return {
        baseURL: process.env.AI_GATEWAY_URL || "",
        apiKey: process.env.REPLIT_AI_API_KEY || "placeholder",
        model: "google/gemini-2.5-flash",
      };
  }
}

/**
 * Health check for AI providers
 */
export async function checkAIHealth(): Promise<Record<AIProvider, boolean>> {
  const results: Record<AIProvider, boolean> = {
    replit_gateway: false,
    ollama: false,
    openrouter: false,
  };

  // Check Replit Gateway
  try {
    if (process.env.AI_GATEWAY_URL && process.env.REPLIT_AI_API_KEY) {
      results.replit_gateway = true;
    }
  } catch {
    // Not available
  }

  // Check Ollama
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    results.ollama = res.ok;
  } catch {
    // Ollama not running
  }

  // Check OpenRouter
  results.openrouter = !!process.env.OPENROUTER_API_KEY;

  return results;
}
