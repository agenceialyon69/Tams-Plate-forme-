import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  tasksTable,
  projectsTable,
  contactsTable,
  memoriesTable,
  decisionsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

const SYSTEM_PROMPT = `Tu es TAMS, un Chief of Staff personnel IA. Tu aides Mohamed à prendre de meilleures décisions, gérer ses priorités, analyser ses risques et exécuter sa vision. Tu es direct, précis, sans langue de bois. Tu réponds toujours en français.

Tu as accès au contexte de Mohamed (tâches, projets, contacts, mémoires, décisions) et tu peux agir sur son système en appelant des fonctions quand c'est pertinent. Par exemple, si Mohamed te demande de créer une tâche, utilise la fonction create_task. Si il te parle d'un nouveau contact, propose de l'ajouter avec create_contact.`;

const MODE_PROMPTS: Record<string, string> = {
  chief_of_staff: `Mode Chef de Cabinet : Tu analyses la situation globale de Mohamed — projets, tâches, contacts — et tu fournis un briefing stratégique actionnable. Sois direct et synthétique. Utilise le contexte fourni pour donner des conseils pertinents.`,
  decision: `Mode Décision : Tu aides Mohamed à structurer et analyser une décision. Tu identifies les options, les avantages, les risques, et tu donnes un avis clair avec un niveau de confiance. Si Mohamed décide, tu peux créer la décision dans le système avec create_decision.`,
  red_team: `Mode Red Team : Tu joues l'avocat du diable. Tu identifies les failles, les risques cachés, les erreurs de raisonnement. Tu es critique constructif, jamais complaisant.`,
  execution: `Mode Exécution : Tu transformes les intentions en actions concrètes. Tu génères des plans d'action précis, des listes de tâches, des priorités claires. Utilise create_task pour ajouter les tâches au système quand Mohamed te le demande.`,
  chat: `Mode Conversation : Tu es un assistant intelligent et direct. Tu réponds aux questions, tu aides à réfléchir, tu partages des idées. Tu as accès au contexte de Mohamed pour donner des réponses personnalisées.`,
};

async function gatherUserContext(): Promise<string> {
  try {
    const activeTasks = await db
      .select()
      .from(tasksTable)
      .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
      .limit(10);

    const activeProjects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.status, "active"))
      .limit(10);

    const recentContacts = await db
      .select()
      .from(contactsTable)
      .limit(5);

    const recentMemories = await db
      .select()
      .from(memoriesTable)
      .limit(10);

    const pendingDecisions = await db
      .select()
      .from(decisionsTable)
      .where(sql`${decisionsTable.status} IN ('pending','analyzing')`)
      .limit(5);

    const parts: string[] = [];

    if (activeTasks.length > 0) {
      parts.push(`Tâches actives: ${activeTasks.map(t => `"${t.title}" (${t.priority}, ${t.status}${t.dueDate ? `, due ${t.dueDate}` : ""})`).join(", ")}`);
    }

    if (activeProjects.length > 0) {
      parts.push(`Projets actifs: ${activeProjects.map(p => `"${p.name}"`).join(", ")}`);
    }

    if (recentContacts.length > 0) {
      parts.push(`Contacts récents: ${recentContacts.map(c => `${c.name}${c.company ? ` (${c.company})` : ""} [${c.status}]`).join(", ")}`);
    }

    if (recentMemories.length > 0) {
      parts.push(`Mémoires: ${recentMemories.map(m => `"${m.title}" (${m.type})`).join(", ")}`);
    }

    if (pendingDecisions.length > 0) {
      parts.push(`Décisions en attente: ${pendingDecisions.map(d => `"${d.title}" [${d.status}]`).join(", ")}`);
    }

    if (parts.length === 0) {
      return "Aucune donnée dans le système pour le moment.";
    }

    return parts.join("\n");
  } catch {
    return "Contexte indisponible.";
  }
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Créer une nouvelle tâche dans le système de Mohamed",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la tâche" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priorité de la tâche" },
          description: { type: "string", description: "Description optionnelle" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: "Créer un nouveau projet dans le système de Mohamed",
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
      description: "Créer un nouveau contact dans le système de Mohamed",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du contact" },
          company: { type: "string", description: "Entreprise" },
          email: { type: "string", description: "Email" },
          status: { type: "string", enum: ["prospect", "active", "inactive", "client"], description: "Statut du contact" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_decision",
      description: "Créer une nouvelle décision à analyser dans le système de Mohamed",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la décision" },
          context: { type: "string", description: "Contexte de la décision" },
        },
        required: ["title"],
      },
    },
  },
];

async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "create_task": {
        const [created] = await db.insert(tasksTable).values({
          title: args.title,
          description: args.description || null,
          priority: args.priority || "medium",
        }).returning();
        return `Tâche créée: "${created.title}" (ID: ${created.id}, priorité: ${created.priority})`;
      }
      case "create_project": {
        const [created] = await db.insert(projectsTable).values({
          name: args.name,
          description: args.description || null,
        }).returning();
        return `Projet créé: "${created.name}" (ID: ${created.id})`;
      }
      case "create_contact": {
        const [created] = await db.insert(contactsTable).values({
          name: args.name,
          company: args.company || null,
          email: args.email || null,
          status: args.status || "prospect",
        }).returning();
        return `Contact créé: "${created.name}" (ID: ${created.id}, statut: ${created.status})`;
      }
      case "create_decision": {
        const [created] = await db.insert(decisionsTable).values({
          title: args.title,
          context: args.context || null,
        }).returning();
        return `Décision créée: "${created.title}" (ID: ${created.id})`;
      }
      default:
        return `Fonction inconnue: ${name}`;
    }
  } catch (err) {
    return `Erreur lors de l'exécution de ${name}: ${err instanceof Error ? err.message : "erreur inconnue"}`;
  }
}

router.get("/conversations", async (req, res) => {
  try {
    const { mode, limit } = req.query;
    const rows = await db
      .select()
      .from(conversationsTable)
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(Number(limit) || 20);

    const filtered = mode ? rows.filter(r => r.mode === mode) : rows;
    return res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Error listing conversations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations", async (req, res) => {
  try {
    const { title, mode } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const [created] = await db.insert(conversationsTable).values({
      title,
      mode: mode || "chat",
      messageCount: 0,
    }).returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id));
    if (!conv) return res.status(404).json({ error: "Not found" });
    return res.json(conv);
  } catch (err) {
    req.log.error({ err }, "Error getting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/conversations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.createdAt);
    return res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const [userMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      content,
    }).returning();

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt)
      .limit(20);

    let aiContent: string;
    let toolResults: string[] = [];

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ baseURL: process.env.AI_GATEWAY_URL, apiKey: process.env.REPLIT_AI_API_KEY || "placeholder" });

      const modePrompt = MODE_PROMPTS[conv.mode] || MODE_PROMPTS.chat;
      const userContext = await gatherUserContext();

      const messages: any[] = [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${modePrompt}\n\nContexte actuel de Mohamed:\n${userContext}` },
        ...history.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content },
      ];

      const completion = await openai.chat.completions.create({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 1000,
        tools: TOOLS,
      });

      const choice = completion.choices[0];

      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        for (const toolCall of choice.message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs: any;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            fnArgs = {};
          }
          const result = await executeTool(fnName, fnArgs);
          toolResults.push(result);
        }

        const followUp = await openai.chat.completions.create({
          model: "google/gemini-2.5-flash",
          messages: [
            ...messages,
            { role: "assistant", content: choice.message.content || "" },
            { role: "system", content: `Résultats des actions effectuées:\n${toolResults.join("\n")}\n\nRésume ce qui a été fait à Mohamed de manière naturelle.` },
          ],
          max_tokens: 800,
        });

        aiContent = followUp.choices[0]?.message?.content || "Action effectuée.";
      } else {
        aiContent = choice?.message?.content || "Je n'ai pas pu générer une réponse. Veuillez réessayer.";
      }
    } catch (err) {
      req.log.warn({ err }, "AI chat failed, using fallback");
      aiContent = `[Mode ${conv.mode}] Je traite votre message : "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}". La connexion IA sera disponible prochainement.`;
    }

    const [assistantMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: aiContent,
    }).returning();

    await db.update(conversationsTable)
      .set({
        messageCount: sql`${conversationsTable.messageCount} + 2`,
        lastMessage: content.slice(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));

    return res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
