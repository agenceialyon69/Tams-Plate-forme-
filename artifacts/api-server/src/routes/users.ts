import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, tenantsTable, memberInvitationsTable } from "@workspace/db";
import { eq, and, ne, count } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { requireRole } from "../middlewares/auth-jwt";
import { signUserJwt, SESSION_DURATION } from "../lib/jwt";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Count active owners in a tenant, optionally excluding one user id. */
async function countActiveOwners(tenantId: number, excludeId?: number): Promise<number> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, tenantId),
        eq(usersTable.role, "owner"),
        eq(usersTable.status, "active"),
        ...(excludeId !== undefined ? [ne(usersTable.id, excludeId)] : []),
      ),
    );
  return rows.length;
}

/** Highest role value a caller is allowed to ASSIGN (not their own role). */
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

// ─── List members ────────────────────────────────────────────────────────────

router.get("/users", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  try {
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
  } catch (err) {
    logger.error({ err, tenantId }, "Failed to list users");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ─── Invite ──────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

/** POST /users/invite — create an invitation link (admin/owner, protected). */
router.post("/users/invite", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const callerId = req.authUser?.id;
  if (!tenantId || !callerId) { res.status(400).json({ error: "Tenant manquant." }); return; }

  const parse = inviteSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  const { email, name, role } = parse.data;
  const callerRole = req.authUser?.role ?? "member";

  // Admin cannot invite another admin.
  if (callerRole === "admin" && role === "admin") {
    res.status(403).json({ error: "Un admin ne peut pas inviter un autre admin." });
    return;
  }

  try {
    // Check the email is not already registered.
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Un compte existe déjà avec cet email." });
      return;
    }

    // Invalidate any pending invitation for the same email in this tenant.
    await db
      .delete(memberInvitationsTable)
      .where(
        and(
          eq(memberInvitationsTable.tenantId, tenantId),
          eq(memberInvitationsTable.email, email.toLowerCase()),
        ),
      );

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

    const [invitation] = await db
      .insert(memberInvitationsTable)
      .values({
        tenantId,
        email: email.toLowerCase(),
        name,
        role,
        token,
        invitedById: callerId,
        expiresAt,
      })
      .returning();

    logger.info(
      { tenantId, invitedBy: callerId, email, role, event: "member.invited" },
      "member.invited",
    );

    res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      inviteToken: token,
      expiresAt: invitation.expiresAt,
    });
  } catch (err) {
    logger.error({ err, tenantId }, "Failed to create invitation");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

/** GET /users/invite/:token — get invitation details (public). */
router.get("/users/invite/:token", async (req, res) => {
  const token = req.params.token;

  try {
    const [inv] = await db
      .select({
        id: memberInvitationsTable.id,
        email: memberInvitationsTable.email,
        name: memberInvitationsTable.name,
        role: memberInvitationsTable.role,
        expiresAt: memberInvitationsTable.expiresAt,
        acceptedAt: memberInvitationsTable.acceptedAt,
        tenantId: memberInvitationsTable.tenantId,
      })
      .from(memberInvitationsTable)
      .where(eq(memberInvitationsTable.token, token))
      .limit(1);

    if (!inv) { res.status(404).json({ error: "Invitation introuvable ou expirée." }); return; }
    if (inv.acceptedAt) { res.status(410).json({ error: "Cette invitation a déjà été acceptée." }); return; }
    if (new Date(inv.expiresAt) < new Date()) { res.status(410).json({ error: "Invitation expirée." }); return; }

    const [tenant] = await db
      .select({ name: tenantsTable.name, slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, inv.tenantId))
      .limit(1);

    res.json({
      email: inv.email,
      name: inv.name,
      role: inv.role,
      expiresAt: inv.expiresAt,
      tenant: tenant ? { name: tenant.name, slug: tenant.slug } : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get invitation");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  name: z.string().min(1).max(100).optional(),
});

/** POST /users/invite/accept — accept an invitation and create the account (public). */
router.post("/users/invite/accept", async (req, res) => {
  const parse = acceptSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  const { token, password, name: overrideName } = parse.data;

  try {
    const [inv] = await db
      .select()
      .from(memberInvitationsTable)
      .where(eq(memberInvitationsTable.token, token))
      .limit(1);

    if (!inv) { res.status(404).json({ error: "Invitation introuvable ou expirée." }); return; }
    if (inv.acceptedAt) { res.status(410).json({ error: "Invitation déjà utilisée." }); return; }
    if (new Date(inv.expiresAt) < new Date()) { res.status(410).json({ error: "Invitation expirée." }); return; }

    // Verify email not already taken (race guard).
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, inv.email))
      .limit(1);
    if (existing) { res.status(409).json({ error: "Un compte existe déjà avec cet email." }); return; }

    const [tenant] = await db
      .select({ name: tenantsTable.name, slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, inv.tenantId))
      .limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant introuvable." }); return; }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: inv.tenantId,
        email: inv.email,
        name: overrideName ?? inv.name,
        role: inv.role,
        passwordHash,
        status: "active",
      })
      .returning();

    await db
      .update(memberInvitationsTable)
      .set({ acceptedAt: new Date() })
      .where(eq(memberInvitationsTable.id, inv.id));

    logger.info(
      { userId: user.id, tenantId: inv.tenantId, role: user.role, event: "member.invite_accepted" },
      "member.invite_accepted",
    );

    const jwtToken = signUserJwt(user, tenant);
    res.status(201).json({
      token: jwtToken,
      sessionDuration: SESSION_DURATION,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: tenant.slug,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to accept invitation");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ─── Change role ─────────────────────────────────────────────────────────────

const updateRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

router.patch("/users/:id/role", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const targetId = Number(req.params.id);
  const callerId = req.authUser?.id;
  const callerRole = req.authUser?.role ?? "member";

  if (!tenantId || isNaN(targetId)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const parse = updateRoleSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Rôle invalide." }); return; }

  const newRole = parse.data.role;

  // Self-guard.
  if (targetId === callerId) {
    res.status(403).json({ error: "Vous ne pouvez pas modifier votre propre rôle." });
    return;
  }

  // Role hierarchy: admin cannot assign owner or admin.
  if (callerRole === "admin" && ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY["admin"]) {
    res.status(403).json({ error: "Un admin ne peut assigner que les rôles member ou viewer." });
    return;
  }

  try {
    const [target] = await db
      .select({ role: usersTable.role, status: usersTable.status, tenantId: usersTable.tenantId })
      .from(usersTable)
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)))
      .limit(1);

    if (!target) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }

    // Admin cannot change another admin's role.
    if (callerRole === "admin" && target.role === "admin") {
      res.status(403).json({ error: "Un admin ne peut pas modifier le rôle d'un autre admin." });
      return;
    }

    // Last-owner guard: don't demote the last active owner.
    if (target.role === "owner" && newRole !== "owner") {
      const remaining = await countActiveOwners(tenantId, targetId);
      if (remaining === 0) {
        res.status(409).json({ error: "Impossible de rétrograder le dernier owner du tenant." });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role: newRole, updatedAt: new Date() })
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)))
      .returning({ id: usersTable.id, role: usersTable.role });

    logger.info(
      { tenantId, actorId: callerId, targetId, oldRole: target.role, newRole, event: "member.role_changed" },
      "member.role_changed",
    );
    res.json(updated);
  } catch (err) {
    logger.error({ err, tenantId, targetId }, "Failed to change role");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ─── Change status (suspend / activate) ─────────────────────────────────────

const statusSchema = z.object({ status: z.enum(["active", "suspended"]) });

router.patch("/users/:id/status", requireRole("admin", "owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const targetId = Number(req.params.id);
  const callerId = req.authUser?.id;
  const callerRole = req.authUser?.role ?? "member";

  if (!tenantId || isNaN(targetId)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  const parse = statusSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Statut invalide." }); return; }

  const newStatus = parse.data.status;

  // Self-guard.
  if (targetId === callerId) {
    res.status(403).json({ error: "Vous ne pouvez pas modifier votre propre statut." });
    return;
  }

  try {
    const [target] = await db
      .select({ role: usersTable.role, status: usersTable.status })
      .from(usersTable)
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)))
      .limit(1);

    if (!target) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }

    // Admin cannot manage another admin or owner.
    if (callerRole === "admin" && ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY["admin"]) {
      res.status(403).json({ error: "Permissions insuffisantes pour modifier ce compte." });
      return;
    }

    // Last-owner guard: don't suspend the last active owner.
    if (target.role === "owner" && newStatus === "suspended") {
      const remaining = await countActiveOwners(tenantId, targetId);
      if (remaining === 0) {
        res.status(409).json({ error: "Impossible de suspendre le dernier owner actif du tenant." });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)))
      .returning({ id: usersTable.id, status: usersTable.status });

    logger.info(
      { tenantId, actorId: callerId, targetId, oldStatus: target.status, newStatus, event: "member.status_changed" },
      "member.status_changed",
    );
    res.json(updated);
  } catch (err) {
    logger.error({ err, tenantId, targetId }, "Failed to change status");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ─── Remove member ───────────────────────────────────────────────────────────

router.delete("/users/:id", requireRole("owner"), async (req, res) => {
  const tenantId = req.tenantId;
  const targetId = Number(req.params.id);
  const callerId = req.authUser?.id;

  if (!tenantId || isNaN(targetId)) { res.status(400).json({ error: "Paramètres invalides." }); return; }

  // Self-guard.
  if (targetId === callerId) {
    res.status(403).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
    return;
  }

  try {
    const [target] = await db
      .select({ role: usersTable.role, email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)))
      .limit(1);

    if (!target) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }

    // Last-owner guard.
    if (target.role === "owner") {
      const remaining = await countActiveOwners(tenantId, targetId);
      if (remaining === 0) {
        res.status(409).json({ error: "Impossible de supprimer le dernier owner du tenant." });
        return;
      }
    }

    await db
      .delete(usersTable)
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tenantId)));

    logger.info(
      { tenantId, actorId: callerId, targetId, email: target.email, event: "member.removed" },
      "member.removed",
    );
    res.json({ ok: true, id: targetId });
  } catch (err) {
    logger.error({ err, tenantId, targetId }, "Failed to delete user");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
