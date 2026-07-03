/**
 * AI Router — free-first, multi-provider, OpenAI-compatible.
 *
 * Goal:
 * - keep TAMS operational even when one provider fails or changes quota/model access;
 * - avoid hard dependency on one paid model;
 * - never expose secret values;
 * - allow Railway env vars to update models without code changes.
 *
 * Provider order:
 *   1. AI_BASE_URL / AI_GATEWAY_URL   explicit custom gateway or remote Ollama/vLLM/LiteLLM
 *   2. OLLAMA_BASE_URL                local/remote open-source runtime, only when explicitly configured
 *   3. Gemini                         multimodal/general lane
 *   4. Groq                           fast/voice/reasoning lane
 *   5. OpenRouter                     free-model routing/fallback lane
 *   6. Hugging Face                   open-source model sandbox/fallback
 *   7. Mistral / DeepSeek / Qwen       direct optional providers
 */

export type AiTask = "chat" | "fast" | "reasoning" | "json";

export type AiProviderName =
  | "custom"
  | "ollama"
  | "gemini"
  | "groq"
  | "openrouter"
  | "huggingface"
  | "mistral"
  | "deepseek"
  | "qwen";

type Provider = {
  name: AiProviderName;
  baseUrl: string;
  apiKey: string;
  /** model by task; null = respect caller model / AI_MODEL for custom gateway */
  models: Record<AiTask, string> | null;
};

function strip(u: string): string {
  return u.replace(/\/+$/, "");
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return undefined;
}

function model(name: string, task: AiTask, fallback: string): string {
  const upper = name.toUpperCase();
  const taskUpper = task.toUpperCase();
  return (
    env(`${upper}_MODEL_${taskUpper}`)
    || env(`${upper}_MODEL`)
    || fallback
  );
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function providers(): Provider[] {
  const list: Provider[] = [];

  const custom = env("AI_BASE_URL") || env("AI_GATEWAY_URL");
  if (custom) {
    list.push({
      name: "custom",
      baseUrl: strip(custom),
      apiKey: env("AI_API_KEY") || env("REPLIT_AI_API_KEY") || "",
      models: null,
    });
  }

  const ollamaBaseUrl = env("OLLAMA_BASE_URL");
  if (ollamaBaseUrl) {
    list.push({
      name: "ollama",
      baseUrl: strip(ollamaBaseUrl),
      apiKey: env("OLLAMA_API_KEY") || "",
      models: {
        chat: model("OLLAMA", "chat", "qwen3"),
        fast: model("OLLAMA", "fast", "llama3.2"),
        reasoning: model("OLLAMA", "reasoning", "deepseek-r1"),
        json: model("OLLAMA", "json", env("OLLAMA_MODEL") || "qwen3"),
      },
    });
  }

  const geminiApiKey = firstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  if (geminiApiKey) {
    list.push({
      name: "gemini",
      baseUrl: strip(env("GEMINI_OPENAI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai"),
      apiKey: geminiApiKey,
      models: {
        chat: model("GEMINI", "chat", "gemini-2.5-flash"),
        fast: model("GEMINI", "fast", "gemini-2.0-flash"),
        reasoning: model("GEMINI", "reasoning", "gemini-2.5-flash"),
        json: model("GEMINI", "json", "gemini-2.5-flash"),
      },
    });
  }

  const groqApiKey = env("GROQ_API_KEY");
  if (groqApiKey) {
    list.push({
      name: "groq",
      baseUrl: strip(env("GROQ_BASE_URL") || "https://api.groq.com/openai/v1"),
      apiKey: groqApiKey,
      models: {
        chat: model("GROQ", "chat", "llama-3.3-70b-versatile"),
        fast: model("GROQ", "fast", "llama-3.1-8b-instant"),
        reasoning: model("GROQ", "reasoning", "deepseek-r1-distill-llama-70b"),
        json: model("GROQ", "json", "llama-3.3-70b-versatile"),
      },
    });
  }

  const openRouterApiKey = firstEnv(["OPENROUTER_API_KEY", "OPENROUTE_API_KEY"]);
  if (openRouterApiKey) {
    list.push({
      name: "openrouter",
      baseUrl: strip(env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1"),
      apiKey: openRouterApiKey,
      models: {
        chat: model("OPENROUTER", "chat", "meta-llama/llama-3.3-70b-instruct:free"),
        fast: model("OPENROUTER", "fast", "meta-llama/llama-3.2-3b-instruct:free"),
        reasoning: model("OPENROUTER", "reasoning", "deepseek/deepseek-r1:free"),
        json: model("OPENROUTER", "json", "meta-llama/llama-3.3-70b-instruct:free"),
      },
    });
  }

  const hfApiKey = firstEnv(["HF_TOKEN", "HUGGINGFACE_API_KEY"]);
  if (hfApiKey) {
    list.push({
      name: "huggingface",
      baseUrl: strip(env("HUGGINGFACE_BASE_URL") || "https://router.huggingface.co/v1"),
      apiKey: hfApiKey,
      models: {
        chat: model("HUGGINGFACE", "chat", "Qwen/Qwen2.5-72B-Instruct"),
        fast: model("HUGGINGFACE", "fast", "Qwen/Qwen2.5-7B-Instruct"),
        reasoning: model("HUGGINGFACE", "reasoning", "deepseek-ai/DeepSeek-R1"),
        json: model("HUGGINGFACE", "json", "Qwen/Qwen2.5-72B-Instruct"),
      },
    });
  }

  const mistralApiKey = env("MISTRAL_API_KEY");
  if (mistralApiKey) {
    list.push({
      name: "mistral",
      baseUrl: strip(env("MISTRAL_BASE_URL") || "https://api.mistral.ai/v1"),
      apiKey: mistralApiKey,
      models: {
        chat: model("MISTRAL", "chat", "mistral-small-latest"),
        fast: model("MISTRAL", "fast", "open-mistral-7b"),
        reasoning: model("MISTRAL", "reasoning", "mistral-small-latest"),
        json: model("MISTRAL", "json", "mistral-small-latest"),
      },
    });
  }

  const deepseekApiKey = env("DEEPSEEK_API_KEY");
  if (deepseekApiKey) {
    list.push({
      name: "deepseek",
      baseUrl: strip(env("DEEPSEEK_BASE_URL") || "https://api.deepseek.com/v1"),
      apiKey: deepseekApiKey,
      models: {
        chat: model("DEEPSEEK", "chat", "deepseek-chat"),
        fast: model("DEEPSEEK", "fast", "deepseek-chat"),
        reasoning: model("DEEPSEEK", "reasoning", "deepseek-reasoner"),
        json: model("DEEPSEEK", "json", "deepseek-chat"),
      },
    });
  }

  const qwenApiKey = firstEnv(["DASHSCOPE_API_KEY", "QWEN_API_KEY"]);
  if (qwenApiKey) {
    list.push({
      name: "qwen",
      baseUrl: strip(env("QWEN_BASE_URL") || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
      apiKey: qwenApiKey,
      models: {
        chat: model("QWEN", "chat", "qwen-plus"),
        fast: model("QWEN", "fast", "qwen-turbo"),
        reasoning: model("QWEN", "reasoning", "qwen-plus"),
        json: model("QWEN", "json", "qwen-plus"),
      },
    });
  }

  return list;
}

export function aiConfigured(): boolean {
  return providers().length > 0;
}

export function aiProviders(): string[] {
  return providers().map(p => p.name);
}

export function aiProviderModels(): Record<string, Partial<Record<AiTask, string>>> {
  return Object.fromEntries(
    providers().map(provider => [provider.name, provider.models ?? { custom: env("AI_MODEL") || "caller_model" }]),
  );
}

function headers(p: Provider): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (p.name === "openrouter") {
    h["HTTP-Referer"] = env("OPENROUTER_REFERER") || "https://tams.app";
    h["X-Title"] = env("OPENROUTER_APP_NAME") || "TAMS";
  }
  return h;
}

function modelFor(p: Provider, body: Record<string, unknown>, task: AiTask): string | undefined {
  if (p.name === "custom") {
    return env("AI_MODEL") || (body.model as string | undefined);
  }
  return p.models![task];
}

function inferTask(body: Record<string, unknown>): AiTask {
  const rf = body.response_format as { type?: string } | undefined;
  if (rf?.type === "json_object" || rf?.type === "json_schema") return "json";
  return "chat";
}

async function readShortError(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 240);
}

export async function aiChat(
  body: Record<string, unknown>,
  task?: AiTask,
): Promise<any> {
  const ps = providers();
  if (ps.length === 0) throw new Error("AI_NOT_CONFIGURED");
  const t = task ?? inferTask(body);

  let lastErr: unknown;
  for (let pass = 0; pass < 2; pass++) {
    for (const p of ps) {
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: headers(p),
          body: JSON.stringify({ ...body, model: modelFor(p, body, t), stream: false }),
          signal: AbortSignal.timeout(Number(env("AI_TIMEOUT_MS") || 45_000)),
        });
        if (!res.ok) {
          lastErr = new Error(`AI[${p.name}] ${res.status}: ${await readShortError(res)}`);
          continue;
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    if (pass === 0) await sleep(Number(env("AI_FALLBACK_RETRY_DELAY_MS") || 700));
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI_ALL_PROVIDERS_FAILED");
}

export async function* aiChatStream(
  body: Record<string, unknown>,
  task?: AiTask,
): AsyncGenerator<any> {
  const ps = providers();
  if (ps.length === 0) throw new Error("AI_NOT_CONFIGURED");
  const t = task ?? inferTask(body);

  let res: Response | null = null;
  let lastErr: unknown;
  for (const p of ps) {
    try {
      const r = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(p),
        body: JSON.stringify({ ...body, model: modelFor(p, body, t), stream: true }),
        signal: AbortSignal.timeout(Number(env("AI_STREAM_TIMEOUT_MS") || 120_000)),
      });
      if (!r.ok || !r.body) {
        lastErr = new Error(`AI[${p.name}] ${r.status}: ${await readShortError(r)}`);
        continue;
      }
      res = r;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!res || !res.body) {
    throw lastErr instanceof Error ? lastErr : new Error("AI_ALL_PROVIDERS_FAILED");
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
      const t2 = line.trim();
      if (!t2.startsWith("data:")) continue;
      const data = t2.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        // Ignore keepalive / partial non-JSON chunks.
      }
    }
  }
}
