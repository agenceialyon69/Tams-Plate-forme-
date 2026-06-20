import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db, usersTable, tenantsTable, passwordResetTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { getJwtSecret, signUserJwt, SESSION_DURATION } from "../lib/jwt";
import { rateLimit } from "../middlewares/rate-limit";

const router = Router();

// Dedicated throttle for credential endpoints (brute-force / abuse protection),
// keyed by IP. Applied to login, register, forgot-password and reset-password.
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

/** Hash a reset token before storing/looking it up (never store it in clear). */
function hashResetToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

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

router.post("/auth/login", authLimiter, async (req, res) => {
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

    const token = signUserJwt(user, tenant ?? { slug: "default" });

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

router.post("/auth/register", authLimiter, async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  const { email, password, name, tenantSlug } = parse.data;

  try {
    // ── Registration gate ────────────────────────────────────────────────────
    // Open self-registration would let anyone create an account and, until full
    // per-tenant data isolation exists, read all data. So registration is closed
    // by default. It is allowed only to bootstrap the very first account, or when
    // SELF_REGISTRATION_ENABLED=true is set explicitly (e.g. going multi-user).
    const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    const isBootstrap = !anyUser;
    const selfRegEnabled = process.env.SELF_REGISTRATION_ENABLED === "true";
    if (!isBootstrap && !selfRegEnabled) {
      res.status(403).json({
        error: "L'inscription est désactivée. Demande une invitation à un administrateur.",
      });
      return;
    }

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

    const token = signUserJwt(user, tenant);

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

router.post("/auth/forgot-password", authLimiter, async (req, res) => {
  const parse = forgotPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Email invalide." });
    return;
  }

  // Identical response whether or not the account exists (no user enumeration).
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

    // Store only the HASH of the token — a DB leak must not yield usable tokens.
    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      token: hashResetToken(rawToken),
      expiresAt,
    });

    // The raw token must NOT be returned in the HTTP response (that would let
    // anyone knowing an email take over the account). It is logged server-side
    // so the operator can retrieve it when no email transport is configured.
    logger.warn(
      { userId: user.id, email: user.email, resetToken: rawToken },
      "Password reset token generated (retrieve from logs — not exposed via API)",
    );

    // Opt-in escape hatch for a single-user setup with no email: only when the
    // operator explicitly accepts the risk via RESET_TOKEN_IN_RESPONSE=true.
    if (process.env.RESET_TOKEN_IN_RESPONSE === "true") {
      res.json({ ...always, resetToken: rawToken });
      return;
    }

    res.json(always);
  } catch (err) {
    logger.error({ err }, "Forgot password error");
    res.json(always);
  }
});

router.post("/auth/reset-password", authLimiter, async (req, res) => {
  const parse = resetPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides." });
    return;
  }

  const { token, newPassword } = parse.data;

  try {
    // Tokens are stored hashed — hash the incoming token to look it up.
    const [resetRecord] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.token, hashResetToken(token)))
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

// Public onboarding signal for the login screen: whether this is a fresh
// install (no users yet → the first account becomes owner) and whether
// self-registration is open. No secret/data leaked.
router.get("/auth/status", async (_req, res) => {
  const selfRegistrationEnabled = process.env.SELF_REGISTRATION_ENABLED === "true";
  try {
    const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    res.json({ bootstrap: !anyUser, selfRegistrationEnabled });
  } catch {
    // Users table not ready yet (fresh install, schema still applying) → treat
    // as bootstrap so the first owner account can be created once it's ready.
    res.json({ bootstrap: true, selfRegistrationEnabled });
  }
});

export default router;
