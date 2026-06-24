import { Router } from "express";
import { db, registryEntriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../middlewares/auth-jwt";
import { logger } from "../lib/logger";

const router = Router();

const createSchema = z.object({
  type: z.enum(["agent", "prompt", "playbook", "policy", "workflow", "provider", "integration", "data_source"]),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  owner: z.string().max(200).default("system"),
  version: z.string().max(50).default("1.0.0"),
  status: z.enum(["active", "draft", "deprecated", "disabled"]).default("draft"),
  sensitivity: z.enum(["public", "internal", "restricted", "critical"]).default("internal"),
  scope: z.string().max(100).default("global"),
  config: z.string().optional(),
});

const updateSchema = createSchema.partial();

router.get("/registry", async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  try {
    const entries = await db
      .select()
      .from(registryEntriesTable)
      .where(eq(registryEntriesTable.tenantId, tenantId))
      .orderBy(registryEntriesTable.updatedAt);

    res.json(entries);
  } catch (err) {
    logger.error({ err }, "Failed to list registry entries");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/registry/:id", async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  try {
    const [entry] = await db
      .select()
      .from(registryEntriesTable)
      .where(and(eq(registryEntriesTable.id, id), eq(registryEntriesTable.tenantId, tenantId)))
      .limit(1);

    if (!entry) { res.status(404).json({ error: "Entrée introuvable." }); return; }
    res.json(entry);
  } catch (err) {
    logger.error({ err }, "Failed to get registry entry");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/registry", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  try {
    const [entry] = await db
      .insert(registryEntriesTable)
      .values({ ...parse.data, tenantId })
      .returning();

    logger.info({ entryId: entry.id, tenantId, userId: req.authUser?.id }, "Registry entry created");
    res.status(201).json(entry);
  } catch (err) {
    logger.error({ err }, "Failed to create registry entry");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/registry/:id", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  try {
    const [updated] = await db
      .update(registryEntriesTable)
      .set({ ...parse.data, updatedAt: new Date() })
      .where(and(eq(registryEntriesTable.id, id), eq(registryEntriesTable.tenantId, tenantId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Entrée introuvable." }); return; }
    logger.info({ entryId: id, tenantId, userId: req.authUser?.id }, "Registry entry updated");
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update registry entry");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/registry/:id", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  try {
    const [deleted] = await db
      .delete(registryEntriesTable)
      .where(and(eq(registryEntriesTable.id, id), eq(registryEntriesTable.tenantId, tenantId)))
      .returning({ id: registryEntriesTable.id });

    if (!deleted) { res.status(404).json({ error: "Entrée introuvable." }); return; }
    logger.info({ entryId: id, tenantId, userId: req.authUser?.id }, "Registry entry deleted");
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete registry entry");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
