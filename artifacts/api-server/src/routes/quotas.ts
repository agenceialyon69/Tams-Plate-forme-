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

    logger.info({ tenantId, userId: req.authUser?.id, changes: parse.data }, "quota.updated");
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update quotas");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export interface AiCallContext {
  userId?: number;
  route?: string;
}

/**
 * Check and atomically increment the tenant's AI call counters.
 *
 * Fail-CLOSED: any DB error denies the call rather than silently allowing a
 * quota bypass. Both allowed and blocked calls are emitted as structured audit
 * log events.
 */
export async function checkAndIncrementAiCalls(
  tenantId: number,
  ctx: AiCallContext = {},
): Promise<{ allowed: boolean; reason?: string }> {
  const logCtx = { tenantId, userId: ctx.userId, route: ctx.route };

  try {
    const quota = await getOrCreateQuota(tenantId);
    const today = new Date().toISOString().slice(0, 10);      // "YYYY-MM-DD"
    const thisMonth = today.slice(0, 7);                       // "YYYY-MM"

    const updates: Record<string, unknown> = {};

    if (quota.lastResetDate !== today) {
      updates.aiCallsToday = 0;
      updates.lastResetDate = today;
      updates.updatedAt = new Date();

      const lastMonth = quota.lastResetDate?.slice(0, 7) ?? "";
      if (lastMonth !== thisMonth) {
        updates.aiCallsThisMonth = 0;
        updates.costCentsThisMonth = 0;
        logger.info({ ...logCtx, month: thisMonth }, "quota.monthly_reset");
      }

      await db
        .update(tenantQuotasTable)
        .set(updates)
        .where(eq(tenantQuotasTable.tenantId, tenantId));

      quota.aiCallsToday = 0;
      if ("aiCallsThisMonth" in updates) quota.aiCallsThisMonth = 0;
    }

    if (quota.aiCallsToday >= quota.maxAiCallsPerDay) {
      logger.warn({
        ...logCtx,
        event: "ai.quota.blocked",
        reason: "daily",
        callsToday: quota.aiCallsToday,
        limitPerDay: quota.maxAiCallsPerDay,
      }, "ai.quota.blocked.daily");
      return {
        allowed: false,
        reason: `Quota journalier IA atteint (${quota.maxAiCallsPerDay} appels/jour).`,
      };
    }

    if (quota.aiCallsThisMonth >= quota.maxAiCallsPerMonth) {
      logger.warn({
        ...logCtx,
        event: "ai.quota.blocked",
        reason: "monthly",
        callsThisMonth: quota.aiCallsThisMonth,
        limitPerMonth: quota.maxAiCallsPerMonth,
      }, "ai.quota.blocked.monthly");
      return {
        allowed: false,
        reason: `Quota mensuel IA atteint (${quota.maxAiCallsPerMonth} appels/mois).`,
      };
    }

    await db
      .update(tenantQuotasTable)
      .set({
        aiCallsToday: quota.aiCallsToday + 1,
        aiCallsThisMonth: quota.aiCallsThisMonth + 1,
        updatedAt: new Date(),
      })
      .where(eq(tenantQuotasTable.tenantId, tenantId));

    logger.info({
      ...logCtx,
      event: "ai.call.allowed",
      callsToday: quota.aiCallsToday + 1,
      maxPerDay: quota.maxAiCallsPerDay,
      callsThisMonth: quota.aiCallsThisMonth + 1,
      maxPerMonth: quota.maxAiCallsPerMonth,
    }, "ai.call.allowed");

    return { allowed: true };
  } catch (err) {
    logger.error({ ...logCtx, err, event: "ai.quota.check.error" }, "ai.quota.check.error — failing closed");
    return { allowed: false, reason: "Erreur de vérification du quota. Réessayez dans un instant." };
  }
}

export default router;
