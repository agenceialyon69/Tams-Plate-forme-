import { Router } from "express";
import { db, approvalRequestsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../middlewares/auth-jwt";
import { logger } from "../lib/logger";

const router = Router();

const RISK_REQUIRED_ROLE: Record<string, "member" | "admin" | "owner"> = {
  low: "member",
  medium: "admin",
  high: "admin",
  critical: "owner",
};

const createSchema = z.object({
  action: z.string().min(1).max(300),
  resource: z.string().min(1).max(300),
  details: z.string().max(2000).default(""),
  risk: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  metadata: z.record(z.unknown()).optional(),
});

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "cancelled"]),
  note: z.string().max(500).optional(),
});

router.get("/approvals", async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  try {
    const rows = await db
      .select()
      .from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.tenantId, tenantId))
      .orderBy(desc(approvalRequestsTable.createdAt))
      .limit(100);

    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to list approvals");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/approvals", async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const [request] = await db
      .insert(approvalRequestsTable)
      .values({
        tenantId,
        requestedById: req.authUser?.id,
        action: parse.data.action,
        resource: parse.data.resource,
        details: parse.data.details,
        risk: parse.data.risk,
        metadata: parse.data.metadata ?? null,
        expiresAt,
        status: "pending",
      })
      .returning();

    logger.info({ approvalId: request.id, tenantId, userId: req.authUser?.id, risk: parse.data.risk }, "Approval request created");
    res.status(201).json(request);
  } catch (err) {
    logger.error({ err }, "Failed to create approval request");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/approvals/:id", async (req, res) => {
  const tenantId = req.tenantId;
  const id = Number(req.params.id);
  if (!tenantId || isNaN(id)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const parse = reviewSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(approvalRequestsTable)
      .where(and(eq(approvalRequestsTable.id, id), eq(approvalRequestsTable.tenantId, tenantId)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Demande introuvable." }); return; }
    if (existing.status !== "pending") {
      res.status(409).json({ error: "Cette demande a déjà été traitée." });
      return;
    }

    const requiredRole = RISK_REQUIRED_ROLE[existing.risk] ?? "admin";
    const roleHierarchy: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
    const userLevel = roleHierarchy[req.authUser?.role ?? "viewer"] ?? 0;
    const requiredLevel = roleHierarchy[requiredRole] ?? 99;

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: `Cette action requiert le rôle ${requiredRole} minimum.` });
      return;
    }

    const [updated] = await db
      .update(approvalRequestsTable)
      .set({
        status: parse.data.decision as "approved" | "rejected" | "cancelled",
        reviewedById: req.authUser?.id,
        reviewNote: parse.data.note ?? null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(approvalRequestsTable.id, id))
      .returning();

    logger.info({
      approvalId: id,
      decision: parse.data.decision,
      reviewerId: req.authUser?.id,
      tenantId,
    }, "Approval request reviewed");

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to review approval request");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
