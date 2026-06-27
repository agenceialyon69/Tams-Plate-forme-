/**
 * Outils & contexte partagés — Chat OS (P2) + Agent System (P3).
 *
 * LOT 12 : +6 outils (web_search, generate_image, list_tasks, list_memories,
 *           run_agent, generate_report) s'ajoutent aux 5 historiques.
 *
 * Source unique de vérité pour : prompt système TAMS, prompts de mode,
 * collecte du contexte, catalogue d'outils OpenAI-compatible, exécution.
 * Utilisé par conversations.ts (Chat) ET agents.ts (Agent System).
 */
import { db } from "@workspace/db";
import {
  tasksTable,
  projectsTable,
  contactsTable,
  memoriesTable,
  decisionsTable,
  assetsTable,
} from "@workspace/db";
import { eq, desc, sql, ilike, or } from "drizzle-orm";

// ─── Prompts système ───────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Tu es TAMS, un Chief of Staff personnel IA ultra-puissant. Tu aides Mohamed à prendre de meilleures décisions, gérer ses priorités, analyser ses risques et exécuter sa vision. Tu es direct, précis, sans langue de bois. Tu réponds TOUJOURS en français.

Tu as accès au contexte complet de Mohamed (tâches, projets, contacts, mémoires, décisions) et tu peux AGIR sur son système via des fonctions. Tu as aussi des capacités avancées :

🔍 RECHERCHE WEB : utilise web_search pour toute info récente ou factuelle.
🎨 GÉNÉRATION D'IMAGE : utilise generate_image dès que Mohamed veut créer une image. Tape /image pour déclencher directement.
📋 LISTER : utilise list_tasks ou list_memories pour répondre à "montre-moi mes tâches" ou "qu'est-ce que je sais sur...".
🤖 AGENTS : utilise run_agent pour déléguer une analyse spécialisée (engineering, product, business, marketing, research, decision, studio, devops, redteam).
📄 RAPPORTS : utilise generate_report pour créer un rapport structuré.

Raccourcis reconnus :
- /image [description] → generate_image
- /cherche [requête] ou /search → web_search
- /tâches → list_tasks
- /mémoire → list_memories
- /agent [nom] [instruction] → run_agent
- /rapport [sujet] → generate_report

Tu agis proactivement. Si Mohamed dit "fais-moi une liste" → create_task pour chaque élément. Si il demande une image → generate_image immédiatement. Si il veut chercher → web_search. Ne demande jamais la permission d'utiliser les outils quand l'intention est claire.`;

export const MODE_PROMPTS: Record<string, string> = {
  chief_of_staff: `Mode Chef de Cabinet : Tu analyses la situation globale de Mohamed — projets, tâches, contacts — et tu fournis un briefing stratégique actionnable. Sois direct et synthétique. Utilise le contexte fourni pour des conseils pertinents. N'hésite pas à chercher sur le web ou à déléguer aux agents spécialisés.`,
  decision: `Mode Décision : Tu aides Mohamed à structurer et analyser une décision. Tu identifies les options, les avantages, les risques, et tu donnes un avis clair avec un niveau de confiance. Utilise run_agent avec "decision" pour une analyse poussée. Si Mohamed décide, crée la décision avec create_decision.`,
  red_team: `Mode Red Team : Tu joues l'avocat du diable. Tu identifies les failles, les risques cachés, les erreurs de raisonnement. Tu es critique constructif, jamais complaisant. Utilise run_agent avec "redteam" pour une analyse Red Team profonde.`,
  execution: `Mode Exécution : Tu transformes les intentions en actions concrètes. Tu génères des plans d'action précis, des listes de tâches, des priorités claires. Utilise create_task pour chaque action identifiée. Utilise generate_report pour un plan complet.`,
  chat: `Mode Conversation : Tu es un assistant intelligent, direct et proactif. Tu réponds aux questions, analyses les situations, explores les idées. Tu utilises les outils sans qu'on te le demande explicitement quand l'intention est claire.`,
};

// ─── Contexte utilisateur ──────────────────────────────────────────────────────

export async function gatherUserContext(): Promise<string> {
  try {
    const [tasks, projects, contacts, memories, decisions] = await Promise.all([
      db.select().from(tasksTable)
        .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(desc(tasksTable.createdAt))
        .limit(8),
      db.select().from(projectsTable)
        .where(eq(projectsTable.status, "active"))
        .limit(5),
      db.select().from(contactsTable)
        .orderBy(desc(contactsTable.createdAt))
        .limit(5),
      db.select().from(memoriesTable)
        .orderBy(desc(memoriesTable.createdAt))
        .limit(5),
      db.select().from(decisionsTable)
        .where(sql`${decisionsTable.status} IN ('pending','analyzing')`)
        .limit(3),
    ]);

    return [
      tasks.length > 0 ? `Tâches actives (${tasks.length}): ${tasks.map(t => `"${t.title}" (${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ""})`).join(", ")}` : "",
      projects.length > 0 ? `Projets actifs: ${projects.map(p => `"${p.name}"`).join(", ")}` : "",
      contacts.length > 0 ? `Contacts récents: ${contacts.map(c => `${c.name}${c.company ? ` (${c.company})` : ""}`).join(", ")}` : "",
      memories.length > 0 ? `Mémoires récentes: ${memories.map(m => `"${m.title}" [${m.type}]`).join(", ")}` : "",
      decisions.length > 0 ? `Décisions en cours: ${decisions.map(d => `"${d.title}"`).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "Contexte non disponible.";
  }
}

// ─── Recherche web (DuckDuckGo, sans clé) ─────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    // DuckDuckGo Instant Answer — aucune clé requise
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { "User-Agent": "TAMS-OS/1.0 (https://github.com/agenceialyon69/Tams-Plate-forme-)" },
      signal: AbortSignal.timeout(6000),
    });

    if (ddgRes.ok) {
      const data = await ddgRes.json() as Record<string, any>;

      if (data.Answer) {
        results.push({ title: "Réponse directe", url: data.AnswerURL || "", snippet: String(data.Answer) });
      }
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "",
          snippet: String(data.AbstractText).slice(0, 400),
        });
      }
      const topics: any[] = data.RelatedTopics || [];
      for (const topic of topics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: String(topic.Text).slice(0, 100),
            url: String(topic.FirstURL),
            snippet: String(topic.Text).slice(0, 250),
          });
        }
      }
    }
  } catch {
    // DuckDuckGo failed — try SearXNG public instance
  }

  // Fallback : SearXNG public instance (plusieurs disponibles)
  if (results.length === 0) {
    const searxInstances = [
      "https://search.bus-hit.me",
      "https://searx.be",
      "https://paulgo.io",
    ];
    for (const instance of searxInstances) {
      try {
        const searxRes = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&format=json&language=fr`, {
          headers: {
            "User-Agent": "TAMS-OS/1.0",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (searxRes.ok) {
          const data = await searxRes.json() as { results?: any[] };
          for (const r of (data.results || []).slice(0, 5)) {
            results.push({
              title: String(r.title || "").slice(0, 100),
              url: String(r.url || ""),
              snippet: String(r.content || r.snippet || "").slice(0, 300),
            });
          }
          if (results.length > 0) break;
        }
      } catch {
        continue;
      }
    }
  }

  if (results.length === 0) {
    results.push({
      title: "Aucun résultat trouvé",
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: `Recherchez "${query}" directement sur DuckDuckGo.`,
    });
  }

  return results;
}

// ─── Catalogue d'outils (OpenAI tool-calling format) ──────────────────────────

export const TOOLS = [
  // ── Historiques ──────────────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Crée une nouvelle tâche dans le système de Mohamed. Utilise dès qu'il demande de noter, planifier ou créer une tâche.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la tâche" },
          description: { type: "string", description: "Description optionnelle" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priorité (défaut: medium)" },
          dueDate: { type: "string", description: "Date d'échéance au format YYYY-MM-DD (optionnel)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: "Crée un nouveau projet dans le workspace de Mohamed.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du projet" },
          description: { type: "string", description: "Description optionnelle" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_contact",
      description: "Crée un nouveau contact dans le CRM de Mohamed.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom complet" },
          company: { type: "string", description: "Entreprise" },
          email: { type: "string", description: "Email" },
          phone: { type: "string", description: "Téléphone" },
          status: { type: "string", enum: ["prospect", "active", "client", "inactive"], description: "Statut" },
          notes: { type: "string", description: "Notes optionnelles" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_decision",
      description: "Crée une décision à analyser dans le Decision OS de Mohamed.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la décision" },
          context: { type: "string", description: "Contexte et enjeux" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_memory",
      description: "Enregistre une information importante dans la mémoire de Mohamed (personne, projet, décision, note, objectif…).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre / sujet" },
          content: { type: "string", description: "Contenu détaillé" },
          type: { type: "string", enum: ["person", "project", "company", "decision", "note", "goal", "event"], description: "Type de mémoire" },
          tags: { type: "array", items: { type: "string" }, description: "Tags optionnels" },
        },
        required: ["title"],
      },
    },
  },

  // ── LOT 12 : nouveaux outils ──────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Recherche des informations actuelles sur le web via DuckDuckGo/SearXNG (sans clé API). Utilise pour toute info récente, actualité, tendance, fait vérifiable. Raccourci : /cherche ou /search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Requête de recherche (français ou anglais)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_image",
      description: "Génère une image IA 100% gratuite via Pollinations/Flux. Utilise dès que Mohamed veut créer, visualiser ou illustrer quelque chose. Raccourci : /image [description]. L'image est sauvegardée dans le Studio.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description détaillée de l'image en anglais (meilleurs résultats)" },
          width: { type: "number", description: "Largeur en pixels (défaut: 1024)" },
          height: { type: "number", description: "Hauteur en pixels (défaut: 1024)" },
          style: { type: "string", description: "Style artistique optionnel (ex: photorealistic, watercolor, digital art)" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "Liste les tâches de Mohamed. Utilise quand il demande à voir ses tâches, son plan de travail, ses priorités ou sa to-do list. Raccourci : /tâches.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["todo", "in_progress", "done", "cancelled"], description: "Filtrer par statut" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Filtrer par priorité" },
          limit: { type: "number", description: "Nombre max de résultats (défaut: 20)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_memories",
      description: "Accède à la mémoire de Mohamed : personnes connues, projets, entreprises, décisions passées, notes, objectifs, événements. Raccourci : /mémoire.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["person", "project", "company", "decision", "note", "goal", "event"], description: "Filtrer par type" },
          search: { type: "string", description: "Texte à rechercher dans les titres et contenus" },
          limit: { type: "number", description: "Nombre max de résultats (défaut: 15)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_agent",
      description: "Délègue une analyse à un agent spécialisé. Utilise pour des analyses profondes : engineering (code/archi), product (UX/produit), business (modèle économique), marketing (croissance), research (veille), decision (décision structurée), studio (création), devops (infrastructure), redteam (critique), memory (mémoire). Raccourci : /agent.",
      parameters: {
        type: "object",
        properties: {
          agentId: {
            type: "string",
            enum: ["engineering", "product", "business", "marketing", "research", "decision", "studio", "devops", "redteam", "memory", "executive"],
            description: "Identifiant de l'agent spécialisé",
          },
          instruction: { type: "string", description: "L'instruction complète à donner à l'agent" },
        },
        required: ["agentId", "instruction"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_report",
      description: "Génère un rapport structuré en Markdown sur n'importe quel sujet. Utilise pour créer des analyses, synthèses, plans stratégiques, comparatifs, bilans. Raccourci : /rapport.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Le sujet du rapport" },
          context: { type: "string", description: "Contexte spécifique ou données additionnelles" },
          format: {
            type: "string",
            enum: ["executive_summary", "action_plan", "analysis", "comparison", "bilan", "strategy"],
            description: "Format du rapport (défaut: analysis)",
          },
        },
        required: ["topic"],
      },
    },
  },
] as const;

export const TOOL_NAMES = TOOLS.map(t => t.function.name);

export function toolsFor(names: string[]): typeof TOOLS {
  return TOOLS.filter(t => names.includes(t.function.name)) as unknown as typeof TOOLS;
}

// ─── Exécution des outils ──────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    switch (name) {

      // ── Historiques ────────────────────────────────────────────────────────
      case "create_task": {
        const [created] = await db.insert(tasksTable).values({
          title: String(args.title),
          description: args.description ? String(args.description) : null,
          priority: (args.priority as any) || "medium",
          dueDate: args.dueDate ? String(args.dueDate) : null,
        }).returning();
        return JSON.stringify({ __type: "created_task", id: created.id, title: created.title, priority: created.priority, status: created.status });
      }

      case "create_project": {
        const [created] = await db.insert(projectsTable).values({
          name: String(args.name),
          description: args.description ? String(args.description) : null,
        }).returning();
        return JSON.stringify({ __type: "created_project", id: created.id, name: created.name });
      }

      case "create_contact": {
        const [created] = await db.insert(contactsTable).values({
          name: String(args.name),
          company: args.company ? String(args.company) : null,
          email: args.email ? String(args.email) : null,
          phone: args.phone ? String(args.phone) : null,
          status: (args.status as any) || "prospect",
          notes: args.notes ? String(args.notes) : null,
        }).returning();
        return JSON.stringify({ __type: "created_contact", id: created.id, name: created.name, status: created.status });
      }

      case "create_decision": {
        const [created] = await db.insert(decisionsTable).values({
          title: String(args.title),
          context: args.context ? String(args.context) : null,
        }).returning();
        return JSON.stringify({ __type: "created_decision", id: created.id, title: created.title });
      }

      case "create_memory": {
        const [created] = await db.insert(memoriesTable).values({
          title: String(args.title),
          content: args.content ? String(args.content) : null,
          type: (args.type as any) || "note",
          tags: Array.isArray(args.tags) ? args.tags : [],
        }).returning();
        return JSON.stringify({ __type: "created_memory", id: created.id, title: created.title, type: created.type });
      }

      // ── LOT 12 : nouveaux outils ─────────────────────────────────────────
      case "web_search": {
        const results = await searchWeb(String(args.query));
        return JSON.stringify({ __type: "search", query: String(args.query), results });
      }

      case "generate_image": {
        const rawPrompt = String(args.prompt || "abstract art");
        const style = args.style ? ` ${args.style}` : "";
        const fullPrompt = `${rawPrompt}${style}`;
        const w = Number(args.width) || 1024;
        const h = Number(args.height) || 1024;
        const seed = Date.now() % 100000;
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&model=flux&nologo=true&seed=${seed}`;

        // Persister dans les assets Studio
        const [asset] = await db.insert(assetsTable).values({
          name: rawPrompt.slice(0, 60),
          type: "image",
          url: imageUrl,
          content: fullPrompt,
          mimeType: "image/webp",
          tags: ["generated", "ai", "pollinations"],
        }).returning();

        return JSON.stringify({ __type: "image", url: imageUrl, prompt: rawPrompt, assetId: asset.id, w, h });
      }

      case "list_tasks": {
        let query = db.select().from(tasksTable);
        const conditions: any[] = [];
        if (args.status) conditions.push(eq(tasksTable.status, args.status as any));
        if (args.priority) conditions.push(eq(tasksTable.priority, args.priority as any));

        let tasks;
        if (conditions.length > 0) {
          tasks = await (conditions.length === 1
            ? query.where(conditions[0])
            : query.where(sql`${conditions.map(c => sql`(${c})`).reduce((a, b) => sql`${a} AND ${b}`)}`)
          ).orderBy(desc(tasksTable.createdAt)).limit(Number(args.limit) || 20);
        } else {
          tasks = await query
            .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
            .orderBy(desc(tasksTable.createdAt))
            .limit(Number(args.limit) || 20);
        }

        return JSON.stringify({
          __type: "task_list",
          count: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate,
            description: t.description,
          })),
        });
      }

      case "list_memories": {
        let query = db.select().from(memoriesTable);
        const conditions: any[] = [];
        if (args.type) conditions.push(eq(memoriesTable.type, args.type as any));
        if (args.search) {
          conditions.push(
            or(
              ilike(memoriesTable.title, `%${args.search}%`),
              ilike(memoriesTable.content, `%${args.search}%`),
            )!,
          );
        }

        let memories;
        if (conditions.length > 0) {
          memories = await query.where(conditions[0]).orderBy(desc(memoriesTable.updatedAt)).limit(Number(args.limit) || 15);
        } else {
          memories = await query.orderBy(desc(memoriesTable.updatedAt)).limit(Number(args.limit) || 15);
        }

        return JSON.stringify({
          __type: "memory_list",
          count: memories.length,
          items: memories.map(m => ({
            id: m.id,
            title: m.title,
            type: m.type,
            content: m.content ? m.content.slice(0, 150) : null,
            tags: m.tags,
          })),
        });
      }

      case "run_agent": {
        // Import dynamique pour éviter les dépendances circulaires
        const { runAgent } = await import("./agents");
        const agentId = (args.agentId as any) || "executive";
        const result = await runAgent(agentId, String(args.instruction));
        return JSON.stringify({
          __type: "agent_result",
          agentId,
          agentName: result.name,
          response: result.output,
          toolsUsed: result.toolsUsed,
        });
      }

      case "generate_report": {
        const { aiChat } = await import("./ai");
        const formatMap: Record<string, string> = {
          executive_summary: "résumé exécutif (3 sections : situation, enjeux, recommandations)",
          action_plan: "plan d'action (objectifs, étapes numérotées, KPIs, risques)",
          analysis: "analyse structurée (contexte, faits, interprétation, conclusions)",
          comparison: "comparatif (tableau de critères, avantages/inconvénients par option)",
          bilan: "bilan (réalisé, en cours, en retard, recommandations)",
          strategy: "plan stratégique (vision, piliers, actions prioritaires, roadmap 90 jours)",
        };
        const fmt = formatMap[args.format as string] || formatMap.analysis;
        const userCtx = await gatherUserContext();

        const completion = await aiChat({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Tu es TAMS, Chief of Staff IA de Mohamed. Génère un rapport en Markdown au format : ${fmt}. Sois précis, actionnable, direct. Réponds uniquement en français.\n\nContexte Mohamed:\n${userCtx}`,
            },
            {
              role: "user",
              content: `Sujet : ${args.topic}${args.context ? `\n\nContexte additionnel : ${args.context}` : ""}`,
            },
          ],
          max_tokens: 2000,
        });

        const content = completion.choices[0]?.message?.content ?? "Génération du rapport échouée.";
        return JSON.stringify({
          __type: "report",
          topic: String(args.topic),
          format: String(args.format || "analysis"),
          content,
        });
      }

      default:
        return JSON.stringify({ __type: "error", message: `Fonction inconnue: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({
      __type: "error",
      message: `Erreur lors de l'exécution de ${name}: ${err instanceof Error ? err.message : "erreur inconnue"}`,
    });
  }
}
