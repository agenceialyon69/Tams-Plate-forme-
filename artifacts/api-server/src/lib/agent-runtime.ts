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
import { readFile as ghReadFile, listTree, searchCode } from "./github-code-operator.js";
import { getAllTools, runTool } from "./agents/orchestrator.js";

// Outils sûrs réutilisés du registre existant (schémas identiques garantis).
// Inclut la génération de MÉDIA (image/vidéo/musique) : produit des fichiers,
// non destructif → l'agent peut créer une vidéo directement depuis le Chat.
const SAFE_REGISTRY_TOOLS = ["create_task", "search_memories", "generate_image", "create_video", "generate_music"];

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

// Lecture SEULE du dépôt GitHub (aucune écriture ici). Permet un vrai "audit du repo".
const GITHUB_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_repo",
      description: "Liste l'arborescence des fichiers du dépôt GitHub connecté (pour comprendre la structure, auditer). Lecture seule.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_repo_file",
      description: "Lit le contenu d'un fichier du dépôt GitHub connecté (secrets caviardés). Lecture seule.",
      parameters: { type: "object", properties: { path: { type: "string", description: "Chemin du fichier dans le repo (ex. artifacts/api-server/src/app.ts)" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_repo",
      description: "Recherche du code/texte dans le dépôt GitHub connecté (GitHub Code Search). Lecture seule.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Termes à rechercher dans le code" } }, required: ["query"] },
    },
  },
];

function buildTools(): unknown[] {
  const registry = getAllTools().filter((t: { function?: { name?: string } }) =>
    SAFE_REGISTRY_TOOLS.includes(t.function?.name ?? ""));
  return [...WEB_TOOLS, ...GITHUB_READ_TOOLS, ...registry];
}

const SYSTEM_PROMPT = [
  "Tu es TAMS, l'agent personnel privé et unique de Mohamed. Tu agis comme une équipe d'ingénieurs seniors en posture RED TEAM : franc, priorisé par impact, jamais flatteur.",
  "Tu disposes d'OUTILS que tu peux appeler toi-même : web_search (recherche web), read_url (lire une page), read_feed (veille RSS/Atom), create_task (créer une tâche = confier une mission), search_memories (chercher en mémoire), generate_image (image gratuite), create_video (vraie vidéo MP4 diaporama), generate_music (musique).",
  "Tu peux aussi LIRE le dépôt GitHub connecté (lecture seule) : list_repo (arborescence), read_repo_file (contenu d'un fichier), search_repo (recherche). Utilise-les pour un vrai audit du code. Tu n'écris/ne modifies rien ici : l'écriture passe par l'agent codeur avec confirmation.",
  "Le Chat est le poste de commande : tu peux exécuter des missions ET créer des médias directement ici. Quand tu génères une image/vidéo/musique, le fichier est affiché automatiquement à l'utilisateur — inutile de coller l'URL toi-même.",
  "Pour la vidéo : c'est un diaporama MP4 composé (pas de l'IA vidéo premium type Veo). Préviens que fournir de vraies photos produit améliore nettement le rendu.",
  "RÈGLES ABSOLUES :",
  "- N'invente JAMAIS un fait, une source, un chiffre. Si tu as besoin d'une info récente ou vérifiable, appelle web_search puis, si utile, read_url sur la meilleure source.",
  "- Dis honnêtement ce qui n'est PAS branché : Gmail, Google Agenda et WhatsApp ne sont pas connectés aujourd'hui ; ne prétends pas y accéder.",
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
  if (name === "list_repo") {
    const tree = await listTree({ limit: 2000 });
    const files = tree.entries.filter(e => e.type === "blob").map(e => e.path).slice(0, 500);
    return `REPO ${tree.repo} (${files.length} fichiers${tree.truncated ? "+" : ""}) :\n${files.join("\n")}`;
  }
  if (name === "read_repo_file") {
    const f = await ghReadFile({ path: String(args.path ?? "") });
    return `FICHIER ${f.path} (${f.size} octets${f.truncated ? ", tronqué" : ""}) :\n\n${f.content}`;
  }
  if (name === "search_repo") {
    const r = await searchCode({ query: String(args.query ?? ""), limit: 20 });
    return `RECHERCHE "${r.query}" — ${r.total} résultat(s) :\n${r.hits.map(h => h.path).join("\n")}`;
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

  // Rattache les médias produits (IMAGE:/VIDEO:/AUDIO:) à la réponse finale, pour
  // qu'ils s'affichent dans le Chat même si le LLM ne recopie pas le marqueur.
  const withMedia = (message: string): string => {
    const markers = new Set<string>();
    const re = /(VIDEO|IMAGE|AUDIO):(https?:\/\/[^\s\])>;,]+|\/[^\s\])>;,]+)/g;
    for (const step of steps) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(step.output))) markers.add(`${m[1]}:${m[2]}`);
    }
    if (markers.size === 0) return message;
    // On garantit chaque marqueur sur SA PROPRE LIGNE (le Chat n'affiche le
    // lecteur que dans ce cas). Si le LLM l'a mis en ligne / entre crochets, on
    // ajoute quand même une ligne propre.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const missing = [...markers].filter(mk => !new RegExp(`(^|\\n)${esc(mk)}(\\s|$)`).test(message));
    return missing.length ? `${message}\n\n${missing.join("\n")}` : message;
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const resp = await aiChat({ messages, tools, tool_choice: "auto", temperature: 0.4, max_tokens: 1200 }, "reasoning");
    const msg = resp?.choices?.[0]?.message;
    if (!msg) throw new Error("réponse IA vide");
    messages.push(msg);

    const calls = msg.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }> | undefined;
    if (!calls || calls.length === 0) {
      return { message: withMedia(typeof msg.content === "string" ? msg.content : ""), steps };
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
  return { message: withMedia(final?.choices?.[0]?.message?.content ?? "Je n'ai pas pu finaliser cette demande."), steps };
}
