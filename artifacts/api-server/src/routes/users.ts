import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { requireRole } from "../middlewares/auth-jwt";

const router = Router();

router.get("/users", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      status: usersTable.status,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId));

  res.json(users);
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  password: z.string().min(8),
});

router.post("/users/invite", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const parse = inviteSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  const { email, name, role, password } = parse.data;

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Un compte existe déjà avec cet email." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ tenantId, email: email.toLowerCase(), name, role, passwordHash, status: "active" })
    .returning({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role });

  logger.info({ userId: user.id, invitedBy: req.authUser?.id, tenantId }, "User invited");
  res.status(201).json(user);
});

const updateRoleSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) });

router.patch("/users/:id/role", requireRole("owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const userId = Number(req.params.id);
  if (!tenantId || isNaN(userId)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const parse = updateRoleSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Rôle invalide." }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({ role: parse.data.role, updatedAt: new Date() })
    .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
    .returning({ id: usersTable.id, role: usersTable.role });

  if (!updated) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }
  res.json(updated);
});

router.patch("/users/:id/status", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const userId = Number(req.params.id);
  const statusSchema = z.object({ status: z.enum(["active", "suspended"]) });
  const parse = statusSchema.safeParse(req.body);
  if (!tenantId || isNaN(userId) || !parse.success) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({ status: parse.data.status, updatedAt: new Date() })
    .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
    .returning({ id: usersTable.id, status: usersTable.status });

  if (!updated) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }
  res.json(updated);
});

export default router;
