import type { AgentId, AgentMessage, AgentRunResult } from "./types";
import { AGENT_DEFINITIONS } from "./definitions";
import { buildSystemPromptWithContext } from "./registry";

const POLLINATIONS_URL = "https://text.pollinations.ai/openai";

interface PollinationsMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface PollinationsRequest {
  model: string;
  messages: PollinationsMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

const FREE_MODELS = [
  "openai",            // GPT-4o free via Pollinations
  "openai-large",      // GPT-4o-large
  "mistral",           // Mistral free
  "qwen-coder",        // Qwen free
];

let currentModelIndex = 0;

function selectModel(agentId: AgentId): string {
  const modelMap: Partial<Record<AgentId, string>> = {
    engineering: "qwen-coder",
    devops: "qwen-coder",
    research: "openai-large",
    decision: "openai",
    executive: "openai",
    redteam: "openai",
    studio: "openai-large",
  };
  return modelMap[agentId] ?? "openai";
}

export async function runAgent(
  agentId: AgentId,
  userMessage: string,
  conversationHistory: AgentMessage[] = [],
  context: {
    memories?: Array<{ title: string; content: string }>;
    recentTasks?: string[];
    recentDecisions?: string[];
  } = {},
  onChunk?: (chunk: string) => void,
): Promise<AgentRunResult> {
  const start = Date.now();
  const def = AGENT_DEFINITIONS[agentId];
  const systemPrompt = buildSystemPromptWithContext(agentId, context);
  const model = selectModel(agentId);

  const messages: PollinationsMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-8).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const body: PollinationsRequest = {
    model,
    messages,
    max_tokens: def.maxTokens,
    temperature: def.temperature,
    stream: !!onChunk,
  };

  try {
    const res = await fetch(POLLINATIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Pollinations API error: ${res.status}`);
    }

    let fullText = "";

    if (onChunk && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          } catch {}
        }
      }
    } else {
      const data = await res.json();
      fullText = data?.choices?.[0]?.message?.content ?? "Erreur : réponse vide.";
    }

    const latency = Date.now() - start;

    return {
      agent_id: agentId,
      response: fullText,
      delegations: [],
      tool_calls: [],
      tokens_used: Math.ceil(fullText.length / 4),
      model_used: model,
      latency_ms: latency,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erreur inconnue";
    return {
      agent_id: agentId,
      response: `⚠️ **${def.emoji} ${def.name}** indisponible momentanément.\n\nErreur : ${errorMsg}\n\nRéessayez dans quelques instants.`,
      delegations: [],
      tool_calls: [],
      tokens_used: 0,
      model_used: model,
      latency_ms: Date.now() - start,
    };
  }
}

export async function runWithFallback(
  agentId: AgentId,
  userMessage: string,
  conversationHistory: AgentMessage[] = [],
  context: Parameters<typeof runAgent>[3] = {},
  onChunk?: (chunk: string) => void,
): Promise<AgentRunResult> {
  try {
    return await runAgent(agentId, userMessage, conversationHistory, context, onChunk);
  } catch {
    // Fallback to executive agent
    if (agentId !== "executive") {
      return runAgent("executive", userMessage, conversationHistory, context, onChunk);
    }
    throw new Error("All agents unavailable");
  }
}
