import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

const SYSTEM_PROMPT = `Tu es TAMS, un Chief of Staff personnel IA. Tu aides Mohamed à prendre de meilleures décisions, gérer ses priorités, analyser ses risques et exécuter sa vision. Tu es direct, précis, sans langue de bois. Tu réponds toujours en français.`;

const MODE_PROMPTS: Record<string, string> = {
  chief_of_staff: `Mode Chef de Cabinet : Tu analyses la situation globale de Mohamed — projets, tâches, contacts — et tu fournis un briefing stratégique actionnable. Sois direct et synthétique.`,
  decision: `Mode Décision : Tu aides Mohamed à structurer et analyser une décision. Tu identifies les options, les avantages, les risques, et tu donnes un avis clair avec un niveau de confiance.`,
  red_team: `Mode Red Team : Tu joues l'avocat du diable. Tu identifies les failles, les risques cachés, les erreurs de raisonnement. Tu es critique constructif, jamais complaisant.`,
  execution: `Mode Exécution : Tu transformes les intentions en actions concrètes. Tu génères des plans d'action précis, des listes de tâches, des priorités claires.`,
  chat: `Mode Conversation : Tu es un assistant intelligent et direct. Tu réponds aux questions, tu aides à réfléchir, tu partages des idées.`,
};

// LIST conversations
router.get("/conversations", async (req, res) => {
  try {
    const { mode, limit } = req.query;
    let query = db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt));

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

// CREATE conversation
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

// GET conversation
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

// DELETE conversation
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

// LIST messages
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

// SEND message + get AI response
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    // Save user message
    const [userMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      content,
    }).returning();

    // Get conversation history for context
    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt)
      .limit(20);

    // Build AI response
    let aiContent: string;
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ baseURL: process.env.AI_GATEWAY_URL, apiKey: process.env.REPLIT_AI_API_KEY || "placeholder" });

      const modePrompt = MODE_PROMPTS[conv.mode] || MODE_PROMPTS.chat;
      const messages = [
        { role: "system" as const, content: `${SYSTEM_PROMPT}\n\n${modePrompt}` },
        ...history.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content },
      ];

      const completion = await openai.chat.completions.create({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 1000,
      });

      aiContent = completion.choices[0]?.message?.content || "Je n'ai pas pu générer une réponse. Veuillez réessayer.";
    } catch {
      aiContent = `[Mode ${conv.mode}] Je suis TAMS, votre Chief of Staff IA. Je traite votre message : "${content.slice(0, 50)}${content.length > 50 ? "..." : ""}". La connexion IA sera disponible prochainement.`;
    }

    // Save assistant message
    const [assistantMsg] = await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: aiContent,
    }).returning();

    // Update conversation metadata
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
