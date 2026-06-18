import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto, { createHash } from "node:crypto";
import { db, usersTable, tenantsTable, passwordResetTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Resolve the JWT signing secret.
 *
 * Priority:
 *   1. JWT_SECRET env var (>= 32 chars) — set this in production.
 *   2. Derived from API_AUTH_TOKEN if JWT_SECRET is absent — backward-compat
 *      fallback so Railway deploys don't break before JWT_SECRET is added.
 *
 * Throws only if NEITHER is available, giving a clear error instead of a
 * cryptic "Cannot read properties of undefined" deep inside jsonwebtoken.
 */
function getJwtSecret(): string {
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.length >= 32) return explicit;

  const legacy = process.env.API_AUTH_TOKEN;
  if (legacy && legacy.length >= 16) {
    if (!explicit) {
      logger.warn(
        "JWT_SECRET not set — deriving from API_AUTH_TOKEN. " +
          "Set JWT_SECRET explicitly to invalidate old tokens on rotation.",
      );
    }
    return createHash("sha256").update("gandal-jwt:" + legacy).digest("hex");
  }

  throw new Error(
    "Authentication misconfigured: set JWT_SECRET (>= 32 chars) or " +
      "API_AUTH_TOKEN (>= 16 chars) environment variable.",
  );
}

const SESSION_DURATION = process.env.SESSION_DURATION ?? "8h";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  tenantSlug: z.string().min(1).max(60).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/auth/login", async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Email et mot de passe requis." });
    return;
  }

  const { email, password } = parse.data;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Identifiants invalides." });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ error: "Compte suspendu ou inactif." });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      logger.warn({ email, ip: req.ip }, "Failed login attempt");
      res.status(401).json({ error: "Identifiants invalides." });
      return;
    }

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);

    const token = jwt.sign(
      {
        sub: String(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: tenant?.slug ?? "default",
      },
      getJwtSecret(),
      { expiresIn: SESSION_DURATION } as jwt.SignOptions,
    );

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    logger.info({ userId: user.id, email: user.email, tenantId: user.tenantId }, "User logged in");

    res.json({
      token,
      sessionDuration: SESSION_DURATION,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: tenant?.slug ?? "default",
      },
    });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/auth/register", async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  const { email, password, name, tenantSlug } = parse.data;

  try {
    let tenant = tenantSlug
      ? (await db.select().from(tenantsTable).where(eq(tenantsTable.slug, tenantSlug)).limit(1))[0]
      : null;

    if (!tenant) {
      const slug = tenantSlug ?? email.split("@")[1]?.replace(/\./g, "-") ?? "default";
      const [created] = await db
        .insert(tenantsTable)
        .values({ name: slug, slug })
        .returning();
      tenant = created;
    }

    if (!tenant.selfServiceEnabled && tenantSlug) {
      const existingUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.tenantId, tenant.id))
        .limit(1);

      if (existingUsers.length > 0) {
        res.status(403).json({ error: "L'auto-inscription est désactivée pour ce workspace." });
        return;
      }
    }

    const existingUser = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim()))
      .limit(1);

    if (existingUser.length > 0) {
      res.status(409).json({ error: "Un compte existe déjà avec cet email." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const existingTenantUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenant.id))
      .limit(1);

    const isFirstUser = existingTenantUsers.length === 0;

    const [user] = await db
      .insert(usersTable)
      .values({
        tenantId: tenant.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        name,
        role: isFirstUser ? "owner" : "member",
        status: "active",
      })
      .returning();

    const token = jwt.sign(
      {
        sub: String(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: tenant.slug,
      },
      getJwtSecret(),
      { expiresIn: SESSION_DURATION } as jwt.SignOptions,
    );

    logger.info({ userId: user.id, email: user.email, tenantId: tenant.id }, "User registered");

    res.status(201).json({
      token,
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
    logger.error({ err }, "Register error");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      sub: string;
      email: string;
      name: string;
      role: string;
      tenantId: number;
      tenantSlug: string;
    };

    const [user] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        status: usersTable.status,
        tenantId: usersTable.tenantId,
        lastLoginAt: usersTable.lastLoginAt,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, Number(payload.sub)))
      .limit(1);

    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Compte invalide." });
      return;
    }

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);

    res.json({ ...user, tenantSlug: tenant?.slug ?? "default", tenantName: tenant?.name });
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

router.post("/auth/forgot-password", async (req, res) => {
  const parse = forgotPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Email invalide." });
    return;
  }

  const always = { ok: true, message: "Si ce compte existe, un lien de réinitialisation a été généré." };

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.email, parse.data.email.toLowerCase().trim()))
      .limit(1);

    if (!user || user.status !== "active") {
      res.json(always);
      return;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      token: rawToken,
      expiresAt,
    });

    logger.info({ userId: user.id, email: user.email }, "Password reset token generated");

    res.json({ ...always, resetToken: rawToken });
  } catch (err) {
    logger.error({ err }, "Forgot password error");
    res.json(always);
  }
});

router.post("/auth/reset-password", async (req, res) => {
  const parse = resetPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides." });
    return;
  }

  const { token, newPassword } = parse.data;

  try {
    const [resetRecord] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.token, token))
      .limit(1);

    if (!resetRecord || resetRecord.usedAt) {
      res.status(400).json({ error: "Token invalide ou déjà utilisé." });
      return;
    }

    if (resetRecord.expiresAt < new Date()) {
      res.status(400).json({ error: "Token expiré. Refaites une demande de réinitialisation." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, resetRecord.userId));

    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, resetRecord.id));

    logger.info({ userId: resetRecord.userId }, "Password reset successful");
    res.json({ ok: true, message: "Mot de passe réinitialisé. Tu peux te connecter." });
  } catch (err) {
    logger.error({ err }, "Reset password error");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
