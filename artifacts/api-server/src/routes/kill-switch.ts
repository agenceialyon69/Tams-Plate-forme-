import { Router } from "express";
import { db, killSwitchesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../middlewares/auth-jwt";
import { logger } from "../lib/logger";

const router = Router();

const createSchema = z.object({
  target: z.enum(["agent", "provider", "workflow", "module"]),
  targetName: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
});

router.get("/kill-switches", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  try {
    const switches = await db
      .select()
      .from(killSwitchesTable)
      .where(eq(killSwitchesTable.tenantId, tenantId));

    res.json(switches);
  } catch (err) {
    logger.error({ err }, "Failed to list kill switches");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/kill-switches", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  try {
    const [ks] = await db
      .insert(killSwitchesTable)
      .values({
        tenantId,
        target: parse.data.target,
        targetName: parse.data.targetName,
        reason: parse.data.reason ?? null,
        active: false,
      })
      .returning();

    logger.info({ ksId: ks.id, tenantId, userId: req.authUser?.id }, "Kill switch created");
    res.status(201).json(ks);
  } catch (err) {
    logger.error({ err }, "Failed to create kill switch");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/kill-switches/:id/activate", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const parse = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body);
  const reason = parse.success ? parse.data.reason : undefined;

  try {
    const [updated] = await db
      .update(killSwitchesTable)
      .set({
        active: true,
        activatedById: req.authUser?.id,
        activatedAt: new Date(),
        deactivatedAt: null,
        reason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(killSwitchesTable.id, id), eq(killSwitchesTable.tenantId, tenantId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Kill switch introuvable." }); return; }

    logger.warn({
      ksId: id,
      target: updated.target,
      targetName: updated.targetName,
      userId: req.authUser?.id,
      tenantId,
    }, "KILL SWITCH ACTIVATED");

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to activate kill switch");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/kill-switches/:id/deactivate", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  try {
    const [updated] = await db
      .update(killSwitchesTable)
      .set({
        active: false,
        deactivatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(killSwitchesTable.id, id), eq(killSwitchesTable.tenantId, tenantId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Kill switch introuvable." }); return; }

    logger.info({
      ksId: id,
      target: updated.target,
      targetName: updated.targetName,
      userId: req.authUser?.id,
      tenantId,
    }, "Kill switch deactivated");

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to deactivate kill switch");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/kill-switches/:id", requireRole("owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  try {
    const [deleted] = await db
      .delete(killSwitchesTable)
      .where(and(eq(killSwitchesTable.id, id), eq(killSwitchesTable.tenantId, tenantId)))
      .returning({ id: killSwitchesTable.id });

    if (!deleted) { res.status(404).json({ error: "Kill switch introuvable." }); return; }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete kill switch");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
