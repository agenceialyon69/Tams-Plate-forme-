import { Router } from "express";
import { db, tenantQuotasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../middlewares/auth-jwt";
import { logger } from "../lib/logger";

const router = Router();

const updateSchema = z.object({
  maxAiCallsPerDay: z.number().int().min(0).optional(),
  maxAiCallsPerMonth: z.number().int().min(0).optional(),
  maxUsersCount: z.number().int().min(1).optional(),
  maxStorageMb: z.number().int().min(0).optional(),
  maxExportsPerDay: z.number().int().min(0).optional(),
  costBudgetCentsPerMonth: z.number().int().min(0).optional(),
});

async function getOrCreateQuota(tenantId: number) {
  const [existing] = await db
    .select()
    .from(tenantQuotasTable)
    .where(eq(tenantQuotasTable.tenantId, tenantId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(tenantQuotasTable)
    .values({ tenantId })
    .returning();

  return created;
}

router.get("/quotas", async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  try {
    const quota = await getOrCreateQuota(tenantId);
    res.json(quota);
  } catch (err) {
    logger.error({ err }, "Failed to get quotas");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/quotas", requireRole("owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  try {
    await getOrCreateQuota(tenantId);

    const [updated] = await db
      .update(tenantQuotasTable)
      .set({ ...parse.data, updatedAt: new Date() })
      .where(eq(tenantQuotasTable.tenantId, tenantId))
      .returning();

    logger.info({ tenantId, userId: req.authUser?.id }, "Tenant quotas updated");
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update quotas");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export async function checkAndIncrementAiCalls(tenantId: number): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const quota = await getOrCreateQuota(tenantId);
    const today = new Date().toISOString().slice(0, 10);

    if (quota.lastResetDate !== today) {
      await db
        .update(tenantQuotasTable)
        .set({ aiCallsToday: 0, lastResetDate: today, updatedAt: new Date() })
        .where(eq(tenantQuotasTable.tenantId, tenantId));
      quota.aiCallsToday = 0;
    }

    if (quota.aiCallsToday >= quota.maxAiCallsPerDay) {
      return { allowed: false, reason: `Quota journalier IA atteint (${quota.maxAiCallsPerDay} appels/jour).` };
    }

    if (quota.aiCallsThisMonth >= quota.maxAiCallsPerMonth) {
      return { allowed: false, reason: `Quota mensuel IA atteint (${quota.maxAiCallsPerMonth} appels/mois).` };
    }

    await db
      .update(tenantQuotasTable)
      .set({
        aiCallsToday: quota.aiCallsToday + 1,
        aiCallsThisMonth: quota.aiCallsThisMonth + 1,
        updatedAt: new Date(),
      })
      .where(eq(tenantQuotasTable.tenantId, tenantId));

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

export default router;
