/**
 * MOTEUR AGENTIQUE — le Chat "niveau Claude", free-first.
 *
 * L'IA décide elle-même quels outils appeler (recherche web, lire une URL,
 * créer une tâche, chercher en mémoire, générer une image), en plusieurs
 * étapes, puis rédige une réponse. Repose sur le routeur IA free-first
 * (Groq/Gemini/OpenRouter — tool-calling OpenAI-compatible) et sur le registre
 * d'outils existant (runTool = timeout + observabilité).
 *
 * RED TEAM / RÈGLES :
 * - Uniquement des outils SÛRS en auto. Les actions sensibles (ouvrir une PR,
 *   supprimer, déployer) NE sont PAS exposées ici : elles restent derrière la
 *   confirmation de Mon Agent.
 * - Jamais inventer. Honnête sur ce qui n'est pas branché (Gmail/Agenda/WhatsApp).
 */
import { aiChat, aiConfigured } from "./ai.js";
import { webSearch } from "./web-search.js";
import { readUrl } from "./web-read.js";
import { fetchFeed } from "./rss.js";
import { getAllTools, runTool } from "./agents/orchestrator.js";

// Outils sûrs réutilisés du registre existant (schémas identiques garantis).
const SAFE_REGISTRY_TOOLS = ["create_task", "search_memories", "generate_image"];

const WEB_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Recherche sur le web (gratuit). À utiliser pour toute information récente, factuelle ou à vérifier (prix, actualité, données marché…).",
      parameters: { type: "object", properties: { query: { type: "string", description: "La requête de recherche" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_url",
      description: "Récupère et lit le contenu texte d'une page web à partir de son URL (article, page produit, doc en ligne).",
      parameters: { type: "object", properties: { url: { type: "string", description: "L'URL http(s) à lire" } }, required: ["url"] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_feed",
      description: "Lit un flux RSS/Atom et renvoie les derniers articles (veille concurrentielle/sectorielle). Utilise-le quand l'utilisateur veut suivre l'actualité d'une source.",
      parameters: { type: "object", properties: { url: { type: "string", description: "L'URL du flux RSS/Atom" } }, required: ["url"] },
    },
  },
];

function buildTools(): unknown[] {
  const registry = getAllTools().filter((t: { function?: { name?: string } }) =>
    SAFE_REGISTRY_TOOLS.includes(t.function?.name ?? ""));
  return [...WEB_TOOLS, ...registry];
}

const SYSTEM_PROMPT = [
  "Tu es TAMS, l'agent personnel privé et unique de Mohamed. Tu agis comme une équipe d'ingénieurs seniors en posture RED TEAM : franc, priorisé par impact, jamais flatteur.",
  "Tu disposes d'OUTILS que tu peux appeler toi-même : web_search (recherche web), read_url (lire une page), read_feed (veille RSS/Atom d'une source), create_task (créer une tâche), search_memories (chercher en mémoire), generate_image (générer une image gratuite).",
  "RÈGLES ABSOLUES :",
  "- N'invente JAMAIS un fait, une source, un chiffre. Si tu as besoin d'une info récente ou vérifiable, appelle web_search puis, si utile, read_url sur la meilleure source.",
  "- Dis honnêtement ce qui n'est PAS branché : Gmail, Google Agenda et WhatsApp ne sont pas connectés aujourd'hui ; ne prétends pas y accéder.",
  "- Pour la vidéo : tu produis un vrai MP4 diaporama (pas de l'IA vidéo premium type Veo/Runway) — via le Studio, pas ici.",
  "- Réponds en français, clair, concret, priorisé par impact. Cite tes sources (URL) quand tu utilises le web.",
  "- Enchaîne les outils si nécessaire, puis termine par une réponse rédigée et utile.",
].join("\n");

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "web_search") {
    const r = await webSearch(String(args.query ?? ""));
    return r.text;
  }
  if (name === "read_url") {
    const page = await readUrl(String(args.url ?? ""));
    return `TITRE: ${page.title}\n\n${page.text.slice(0, 6000)}`;
  }
  if (name === "read_feed") {
    const feed = await fetchFeed(String(args.url ?? ""));
    const lines = [`FLUX: ${feed.title}`, ...feed.items.slice(0, 10).map(it => `- ${it.title}${it.date ? ` (${it.date})` : ""}${it.link ? `\n  ${it.link}` : ""}`)];
    return lines.join("\n");
  }
  // Outils du registre existant (create_task, search_memories, generate_image).
  return runTool(name, args);
}

export interface AgentStep { tool: string; input: unknown; output: string }
export interface AgentResult { message: string; steps: AgentStep[] }

export interface AgentTurnMessage { role: "user" | "assistant"; content: string }

const MAX_ITERATIONS = 6;

/** Exécute un tour agentique complet : boucle tool-calling puis réponse finale. */
export async function runAgentChat(history: AgentTurnMessage[], userMessage: string): Promise<AgentResult> {
  if (!aiConfigured()) throw new Error("AI_NOT_CONFIGURED");
  const tools = buildTools();
  const messages: Record<string, unknown>[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  const steps: AgentStep[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const resp = await aiChat({ messages, tools, tool_choice: "auto", temperature: 0.4, max_tokens: 1200 }, "reasoning");
    const msg = resp?.choices?.[0]?.message;
    if (!msg) throw new Error("réponse IA vide");
    messages.push(msg);

    const calls = msg.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }> | undefined;
    if (!calls || calls.length === 0) {
      return { message: typeof msg.content === "string" ? msg.content : "", steps };
    }

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args invalides → {} */ }
      let output: string;
      try {
        output = await dispatchTool(call.function.name, args);
      } catch (err) {
        output = `Erreur outil ${call.function.name}: ${err instanceof Error ? err.message : "échec"}`;
      }
      steps.push({ tool: call.function.name, input: args, output: output.slice(0, 4000) });
      messages.push({ role: "tool", tool_call_id: call.id, content: output.slice(0, 6000) });
    }
  }

  // Limite d'itérations atteinte : on force une réponse finale sans nouvel outil.
  const final = await aiChat({
    messages: [...messages, { role: "user", content: "Réponds maintenant avec ce que tu as recueilli, sans appeler de nouvel outil." }],
    temperature: 0.4, max_tokens: 1200,
  }, "reasoning");
  return { message: final?.choices?.[0]?.message?.content ?? "Je n'ai pas pu finaliser cette demande.", steps };
}
