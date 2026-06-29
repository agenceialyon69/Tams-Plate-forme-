/**
 * AI Router (Pilier 8) — free-first, multi-provider, OpenAI-compatible.
 *
 * Constitution 36_FREE_STACK : ZÉRO payant. Aucun SDK propriétaire, aucun défaut
 * vers api.openai.com. Parle à n'importe quel endpoint OpenAI-compatible via
 * `fetch`, et choisit automatiquement le meilleur modèle GRATUIT par tâche, en
 * basculant d'un fournisseur à l'autre en cas d'échec (fallback en chaîne).
 *
 * Ordre free-first (le premier disponible/qui répond gagne) :
 *   1. AI_BASE_URL          (override explicite : Ollama distant, passerelle perso…)
 *   2. Ollama local         (OLLAMA_BASE_URL, ex http://localhost:11434/v1) — vraiment gratuit
 *   3. Groq                 (GROQ_API_KEY) — quota gratuit, très rapide
 *   4. Gemini               (GEMINI_API_KEY) — quota gratuit
 *   5. OpenRouter           (OPENROUTER_API_KEY) — modèles `:free` uniquement
 *
 * Tâches (sélection du modèle par fournisseur) :
 *   chat      conversation générale / Chat OS
 *   fast      réponses courtes, peu coûteuses
 *   reasoning analyse, décisions, Red Team
 *   json      sortie structurée (response_format json)
 *
 * Le `model` passé par l'appelant est traité comme un indice : le routeur le
 * remplace par le modèle gratuit adapté au fournisseur retenu (sauf pour le
 * fournisseur "custom" AI_BASE_URL, qui respecte AI_MODEL si défini).
 *
 * Rétro-compat : AI_GATEWAY_URL, REPLIT_AI_API_KEY, AI_MODEL.
 */

export type AiTask = "chat" | "fast" | "reasoning" | "json";

type Provider = {
  name: string;
  baseUrl: string;
  apiKey: string;
  /** modèle par tâche ; null = respecter le model de l'appelant (custom) */
  models: Record<AiTask, string> | null;
};

function strip(u: string): string {
  return u.replace(/\/+$/, "");
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Construit la liste ordonnée des fournisseurs gratuits disponibles. */
function providers(): Provider[] {
  const list: Provider[] = [];

  // 1. Override explicite (AI_BASE_URL / AI_GATEWAY_URL). Respecte AI_MODEL.
  const custom = process.env.AI_BASE_URL || process.env.AI_GATEWAY_URL || "";
  if (custom) {
    list.push({
      name: "custom",
      baseUrl: strip(custom),
      apiKey: process.env.AI_API_KEY || process.env.REPLIT_AI_API_KEY || "",
      models: null,
    });
  }

  // 2. Ollama local (uniquement si explicitement configuré : évite des timeouts
  //    de 30s sur Railway où aucun Ollama ne tourne).
  if (process.env.OLLAMA_BASE_URL) {
    const ollamaModel = process.env.OLLAMA_MODEL || "qwen3";
    list.push({
      name: "ollama",
      baseUrl: strip(process.env.OLLAMA_BASE_URL),
      apiKey: "",
      models: {
        chat: ollamaModel,
        fast: process.env.OLLAMA_MODEL_FAST || "llama3.2",
        reasoning: process.env.OLLAMA_MODEL_REASONING || "deepseek-r1",
        json: ollamaModel,
      },
    });
  }

  // 3. Groq — quota gratuit, latence très basse.
  if (process.env.GROQ_API_KEY) {
    list.push({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      models: {
        chat: "llama-3.3-70b-versatile",
        fast: "llama-3.1-8b-instant",
        reasoning: "deepseek-r1-distill-llama-70b",
        json: "llama-3.3-70b-versatile",
      },
    });
  }

  // 4. Gemini — quota gratuit (endpoint OpenAI-compatible).
  if (process.env.GEMINI_API_KEY) {
    list.push({
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: process.env.GEMINI_API_KEY,
      models: {
        chat: "gemini-2.5-flash",
        fast: "gemini-2.0-flash",
        reasoning: "gemini-2.5-flash",
        json: "gemini-2.5-flash",
      },
    });
  }

  // 5. OpenRouter — modèles `:free` uniquement (jamais de modèle payant).
  if (process.env.OPENROUTER_API_KEY) {
    list.push({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      models: {
        chat: "meta-llama/llama-3.3-70b-instruct:free",
        fast: "meta-llama/llama-3.2-3b-instruct:free",
        reasoning: "deepseek/deepseek-r1:free",
        json: "meta-llama/llama-3.3-70b-instruct:free",
      },
    });
  }

  return list;
}

/** True si au moins un fournisseur gratuit est configuré. */
export function aiConfigured(): boolean {
  return providers().length > 0;
}

/** Noms des fournisseurs actifs, dans l'ordre de priorité (diagnostic). */
export function aiProviders(): string[] {
  return providers().map(p => p.name);
}

function headers(p: Provider): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  // OpenRouter recommande ces en-têtes (facultatifs, sans incidence ailleurs).
  if (p.name === "openrouter") {
    h["HTTP-Referer"] = process.env.OPENROUTER_REFERER || "https://tams.app";
    h["X-Title"] = "TAMS";
  }
  return h;
}

/** Modèle à utiliser pour ce fournisseur/cette tâche (sinon model appelant). */
function modelFor(p: Provider, body: Record<string, unknown>, task: AiTask): string | undefined {
  if (p.name === "custom") {
    return process.env.AI_MODEL || (body.model as string | undefined);
  }
  return p.models![task];
}

/** Déduit la tâche depuis le corps si non précisée. */
function inferTask(body: Record<string, unknown>): AiTask {
  const rf = body.response_format as { type?: string } | undefined;
  if (rf?.type === "json_object" || rf?.type === "json_schema") return "json";
  return "chat";
}

/**
 * Chat completion non-streamée, avec fallback en chaîne sur les fournisseurs
 * gratuits. Retourne la réponse JSON OpenAI-compatible.
 */
export async function aiChat(
  body: Record<string, unknown>,
  task?: AiTask,
): Promise<any> {
  const ps = providers();
  if (ps.length === 0) throw new Error("AI_NOT_CONFIGURED");
  const t = task ?? inferTask(body);

  let lastErr: unknown;
  // 2 passes : sur quota gratuit saturé (429) quand plusieurs agents appellent
  // en parallèle, une courte pause puis une nouvelle tentative de la chaîne
  // suffit le plus souvent (les limites gratuites se réinitialisent vite).
  for (let pass = 0; pass < 2; pass++) {
    for (const p of ps) {
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: headers(p),
          body: JSON.stringify({ ...body, model: modelFor(p, body, t), stream: false }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) {
          lastErr = new Error(`AI[${p.name}] ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
          continue; // fournisseur suivant
        }
        return await res.json();
      } catch (err) {
        lastErr = err; // timeout / réseau → fournisseur suivant
      }
    }
    if (pass === 0) await sleep(700); // transitoire → petite pause avant 2e passe
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI_ALL_PROVIDERS_FAILED");
}

/**
 * Chat completion streamée. Tente les fournisseurs dans l'ordre jusqu'à ce que
 * l'un accepte la requête, puis stream ses chunks SSE OpenAI-compatibles.
 * (Pas de bascule en cours de stream une fois démarré.)
 */
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
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok || !r.body) {
        lastErr = new Error(`AI[${p.name}] ${r.status}`);
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
        /* ignore les lignes keepalive partielles/non-JSON */
      }
    }
  }
}
