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
  chat: `Mode Conversation : Tu es un assistant intelligent et direct. Tu réponds aux questions, analyses les situations, explores les idées. Tu peux aussi créer des éléments dans le système si Mohamed te le demande.`,
};

async function gatherUserContext(): Promise<string> {
  try {
    const [tasks, projects, contacts, memories, decisions] = await Promise.all([
      db.select().from(tasksTable)
        .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(desc(tasksTable.createdAt))
        .limit(5),
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
      tasks.length > 0 ? `Tâches actives: ${tasks.map(t => `"${t.title}" (${t.priority})`).join(", ")}` : "",
      projects.length > 0 ? `Projets actifs: ${projects.map(p => `"${p.name}"`).join(", ")}` : "",
      contacts.length > 0 ? `Contacts récents: ${contacts.map(c => c.name).join(", ")}` : "",
      memories.length > 0 ? `Mémoires récentes: ${memories.map(m => `"${m.title}"`).join(", ")}` : "",
      decisions.length > 0 ? `Décisions en cours: ${decisions.map(d => `"${d.title}"`).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "Contexte non disponible.";
  }
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Crée une nouvelle tâche dans le système",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la tâche" },
          description: { type: "string", description: "Description optionnelle" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priorité" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: "Crée un nouveau projet",
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
      description: "Crée un nouveau contact",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom complet" },
          company: { type: "string", description: "Entreprise" },
          email: { type: "string", description: "Email" },
          status: { type: "string", enum: ["prospect", "client", "partner", "inactive"] },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_decision",
      description: "Crée une nouvelle décision à analyser",
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
      description: "Enregistre une information importante en mémoire",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre" },
          content: { type: "string", description: "Contenu" },
          type: { type: "string", enum: ["person", "project", "company", "decision", "note", "goal", "event"] },
        },
        required: ["title", "type"],
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
      case "create_memory": {
        const [created] = await db.insert(memoriesTable).values({
          title: args.title,
          content: args.content || null,
          type: args.type || "note",
        }).returning();
        return `Mémoire enregistrée: "${created.title}" (ID: ${created.id})`;
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
    let query = db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt));
    if (mode) {
      const results = await db.select().from(conversationsTable)
        .where(eq(conversationsTable.mode, mode as string))
        .orderBy(desc(conversationsTable.updatedAt))
        .limit(Number(limit) || 20);
      return res.json(results);
    }
    const results = await query.limit(Number(limit) || 20);
    return res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing conversations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations", async (req, res) => {
  try {
    const { title, mode = "chat" } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    const [created] = await db.insert(conversationsTable).values({
      title,
      mode,
    }).returning();
    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id", async (req, res) => {
  try {
    const [conv] = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.id, Number(req.params.id)));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    return res.json(conv);
  } catch (err) {
    req.log.error({ err }, "Error getting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/conversations/:id", async (req, res) => {
  try {
    await db.delete(conversationsTable).where(eq(conversationsTable.id, Number(req.params.id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, Number(req.params.id)))
      .orderBy(messagesTable.createdAt)
      .limit(50);
    return res.json(messages);
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
          try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }
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

// ─── Streaming endpoint (SSE) ─────────────────────────────────────────────────
// POST /conversations/:id/stream
// Body: { content: string }
// Events: {"type":"token","content":"..."} | {"type":"tool","name":"...","result":"..."} | {"type":"done","id":N}
router.post("/conversations/:id/stream", async (req, res) => {
  const conversationId = Number(req.params.id);
  const { content } = req.body;

  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Persist user message
  const [userMsg] = await db.insert(messagesTable).values({
    conversationId,
    role: "user",
    content,
  }).returning();

  send({ type: "user_id", id: userMsg.id });

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt)
    .limit(20);

  let fullContent = "";
  let toolResults: string[] = [];

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      baseURL: process.env.AI_GATEWAY_URL,
      apiKey: process.env.REPLIT_AI_API_KEY || "placeholder",
    });

    const modePrompt = MODE_PROMPTS[conv.mode] || MODE_PROMPTS.chat;
    const userContext = await gatherUserContext();

    const messages: any[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${modePrompt}\n\nContexte actuel:\n${userContext}` },
      ...history.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content },
    ];

    const stream = await openai.chat.completions.create({
      model: "google/gemini-2.5-flash",
      messages,
      max_tokens: 1200,
      tools: TOOLS,
      stream: true,
    });

    let pendingToolCalls: any[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        send({ type: "token", content: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!pendingToolCalls[tc.index]) {
            pendingToolCalls[tc.index] = { id: tc.id, name: tc.function?.name ?? "", args: "" };
          }
          if (tc.function?.name) pendingToolCalls[tc.index].name = tc.function.name;
          if (tc.function?.arguments) pendingToolCalls[tc.index].args += tc.function.arguments;
        }
      }
    }

    // Execute pending tool calls
    if (pendingToolCalls.length > 0) {
      for (const tc of pendingToolCalls) {
        let args: any;
        try { args = JSON.parse(tc.args); } catch { args = {}; }
        const result = await executeTool(tc.name, args);
        toolResults.push(result);
        send({ type: "tool", name: tc.name, result });
      }

      // Follow-up to summarize tool actions
      const followUp = await openai.chat.completions.create({
        model: "google/gemini-2.5-flash",
        messages: [
          ...messages,
          { role: "assistant", content: fullContent || "" },
          { role: "system", content: `Actions effectuées:\n${toolResults.join("\n")}\nRésume naturellement.` },
        ],
        max_tokens: 600,
        stream: true,
      });

      for await (const chunk of followUp) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          send({ type: "token", content: delta.content });
        }
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Streaming AI failed, using fallback");
    const fallback = `[Mode ${conv.mode}] Connexion IA temporairement indisponible. Votre message a été reçu.`;
    fullContent = fallback;
    send({ type: "token", content: fallback });
  }

  // Persist assistant message
  const [assistantMsg] = await db.insert(messagesTable).values({
    conversationId,
    role: "assistant",
    content: fullContent || "...",
  }).returning();

  await db.update(conversationsTable)
    .set({
      messageCount: sql`${conversationsTable.messageCount} + 2`,
      lastMessage: content.slice(0, 100),
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));

  send({ type: "done", id: assistantMsg.id, toolResults });
  res.end();
});

export default router;
