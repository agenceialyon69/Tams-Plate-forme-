import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db, usersTable, tenantsTable, passwordResetTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { getJwtSecret, SESSION_DURATION, signUserJwt } from "../lib/jwt";
import { rateLimit } from "../middlewares/rate-limit";
import {
  createSession,
  validateAccessToken,
  refreshTokens,
  revokeSession,
  revokeAllSessions,
  getActiveSessions,
  getAccessTokenDuration,
  getSessionDurationSeconds,
  getRefreshTokenDurationDays,
} from "../lib/sessions";

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });

function hashResetToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function isOwnerCode(code: string | undefined): boolean {
  const master = process.env.API_AUTH_TOKEN;
  if (!master || master.length < 16 || !code) return false;
  const a = crypto.createHash("sha256").update(code).digest();
  const b = crypto.createHash("sha256").update(master).digest();
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().max(100).optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  tenantSlug: z.string().min(1).max(60).optional(),
  accessCode: z.string().min(1).max(4096).optional(),
  deviceName: z.string().max(100).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Email et mot de passe requis." });
    return;
  }

  const { email, password, deviceName } = parse.data;
  const userAgent = req.headers["user-agent"];
  const ipAddress = req.ip || req.socket.remoteAddress;

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
      logger.warn({ email, ip: ipAddress }, "Failed login attempt");
      res.status(401).json({ error: "Identifiants invalides." });
      return;
    }

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);

    // Create session
    const { accessToken, refreshToken } = await createSession(
      user.id,
      userAgent,
      ipAddress,
      deviceName
    );

    // Sign JWT with session info
    const jwtToken = signUserJwt(user, tenant ?? { slug: "default" });

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    logger.info({ userId: user.id, email: user.email, tenantId: user.tenantId }, "User logged in");

    res.json({
      token: jwtToken,
      accessToken,
      refreshToken,
      accessTokenDuration: getAccessTokenDuration(),
      refreshTokenDurationDays: getRefreshTokenDurationDays(),
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

  const { email, password, name, tenantSlug, deviceName } = parse.data;
  const userAgent = req.headers["user-agent"];
  const ipAddress = req.ip || req.socket.remoteAddress;

  try {
    const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    const isBootstrap = !anyUser;
    const selfRegEnabled = process.env.SELF_REGISTRATION_ENABLED === "true";
    const validOwnerCode = isOwnerCode(parse.data.accessCode);
    if (!isBootstrap && !selfRegEnabled && !validOwnerCode) {
      res.status(403).json({
        error:
          "L'inscription est fermée. Saisis le code propriétaire (API_AUTH_TOKEN) " +
          "pour créer ton compte, ou demande une invitation.",
        code: "REGISTRATION_CLOSED",
      });
      return;
    }

    const slug = tenantSlug ?? email.split("@")[1]?.replace(/\./g, "-") ?? "default";
    let tenant =
      (await db.select().from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1))[0] ?? null;

    if (!tenant) {
      const [created] = await db
        .insert(tenantsTable)
        .values({ name: slug, slug })
        .returning();
      tenant = created;
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

    const isFirstUser = existingTenantUsers.length === 0 || validOwnerCode;

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

    // Create session
    const { accessToken, refreshToken } = await createSession(
      user.id,
      userAgent,
      ipAddress,
      deviceName
    );

    const jwtToken = signUserJwt(user, tenant);

    logger.info({ userId: user.id, email: user.email, tenantId: tenant.id }, "User registered");

    res.status(201).json({
      token: jwtToken,
      accessToken,
      refreshToken,
      accessTokenDuration: getAccessTokenDuration(),
      refreshTokenDurationDays: getRefreshTokenDurationDays(),
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

router.post("/auth/refresh", async (req, res) => {
  const parse = refreshSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Refresh token requis." });
    return;
  }

  const userAgent = req.headers["user-agent"];
  const ipAddress = req.ip || req.socket.remoteAddress;

  try {
    const result = await refreshTokens(parse.data.refreshToken, userAgent, ipAddress);

    if (!result) {
      res.status(401).json({ error: "Refresh token invalide ou expiré." });
      return;
    }

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenDuration: getAccessTokenDuration(),
      refreshTokenDurationDays: getRefreshTokenDurationDays(),
    });
  } catch (err) {
    logger.error({ err }, "Refresh token error");
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

// Get active sessions for current user
router.get("/auth/sessions", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string };
    const userId = Number(payload.sub);

    const sessions = await getActiveSessions(userId);
    res.json({ sessions });
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
});

// Revoke a specific session
router.delete("/auth/sessions/:id", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string };
    const userId = Number(payload.sub);
    const sessionId = Number(req.params.id);

    const success = await revokeSession(sessionId, userId);
    if (!success) {
      res.status(404).json({ error: "Session non trouvée." });
      return;
    }

    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
});

// Revoke all other sessions
router.post("/auth/logout-others", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string };
    const userId = Number(payload.sub);

    // Get current session from access token header
    const accessToken = req.headers["x-access-token"] as string | undefined;
    let currentSessionId: number | undefined;
    if (accessToken) {
      const validation = await validateAccessToken(accessToken);
      currentSessionId = validation?.sessionId;
    }

    const count = await revokeAllSessions(userId, currentSessionId);
    res.json({ ok: true, revokedCount: count });
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
});

// Logout (revoke current session)
router.post("/auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.json({ ok: true });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string };
    const userId = Number(payload.sub);

    // Revoke all sessions (simple logout)
    await revokeAllSessions(userId);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

router.post("/auth/forgot-password", authLimiter, async (req, res) => {
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
      token: hashResetToken(rawToken),
      expiresAt,
    });

    logger.warn(
      { userId: user.id, email: user.email, resetToken: rawToken },
      "Password reset token generated (retrieve from logs — not exposed via API)",
    );

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

    // Revoke all sessions for security
    await revokeAllSessions(resetRecord.userId);

    logger.info({ userId: resetRecord.userId }, "Password reset successful");
    res.json({ ok: true, message: "Mot de passe réinitialisé. Tu peux te connecter." });
  } catch (err) {
    logger.error({ err }, "Reset password error");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/auth/status", async (_req, res) => {
  const selfRegistrationEnabled = process.env.SELF_REGISTRATION_ENABLED === "true";
  try {
    const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    res.json({ bootstrap: !anyUser, selfRegistrationEnabled });
  } catch {
    res.json({ bootstrap: true, selfRegistrationEnabled });
  }
});

export default router;
