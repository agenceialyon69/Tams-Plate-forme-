import { Router } from "express";
import { db, memoriesTable } from "@workspace/db";

const router = Router();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç\s]/gi, " ")
    .split(/\s+/)
    .filter(token => token.length > 2);
}

function scoreMemory(memory: typeof memoriesTable.$inferSelect, tokens: string[]): number {
  const title = memory.title.toLowerCase();
  const content = (memory.content ?? "").toLowerCase();
  const tags = ((memory.tags as string[] | null | undefined) ?? []).join(" ").toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (content.includes(token)) score += 1;
    if (tags.includes(token)) score += 2;
  }
  return score;
}

router.post("/capabilities/execute", async (req, res, next) => {
  const capabilityId = typeof req.body?.capabilityId === "string" ? req.body.capabilityId : "";
  if (capabilityId !== "memory.query") return next();

  const input = typeof req.body?.input === "string" && req.body.input.trim().length > 0
    ? req.body.input.trim()
    : "TAMS";

  try {
    const tokens = tokenize(input);
    const memories = await db.select().from(memoriesTable).limit(200);
    const ranked = memories
      .map(memory => ({ memory, score: scoreMemory(memory, tokens) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const result = ranked.length > 0
      ? ranked.map((item, index) => [
          `#${index + 1} ${item.memory.title}`,
          `Type: ${item.memory.type}`,
          `Score: ${item.score}`,
          `Contenu: ${(item.memory.content ?? "").slice(0, 600)}`,
        ].join("\n")).join("\n\n")
      : "Aucune mémoire correspondante trouvée pour cette requête.";

    return res.json({
      capabilityId,
      status: "success",
      mode: "real",
      title: "Recherche mémoire réelle",
      result,
      artifact: {
        type: "json",
        content: result,
        data: ranked.map(item => ({
          id: item.memory.id,
          title: item.memory.title,
          type: item.memory.type,
          score: item.score,
          updatedAt: item.memory.updatedAt,
        })),
      },
      limitations: [
        "Recherche lexicale sûre sur les mémoires existantes.",
        "La recherche vectorielle pgvector reste dans /api/memories/semantic-search et pourra être branchée ensuite dans ce bus.",
      ],
      nextActions: [
        "Afficher les sources mémoire dans l’UI.",
        "Brancher la recherche sémantique pgvector dans une V3 si DATABASE_URL et embeddings sont prêts.",
      ],
      providerUsed: "memory-db",
      debug: { safe: true, noSecrets: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur mémoire inconnue";
    return res.status(500).json({
      capabilityId,
      status: "error",
      mode: "disabled",
      title: "Erreur recherche mémoire",
      result: message,
      artifact: { type: "none" },
      limitations: ["La base mémoire est inaccessible ou le schéma n’est pas prêt."],
      nextActions: ["Vérifier DATABASE_URL et ensureSchema."],
      providerUsed: "memory-db",
      debug: { safe: true, noSecrets: true },
    });
  }
});

export default router;
