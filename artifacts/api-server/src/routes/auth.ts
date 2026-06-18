import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 chars long.");
  }
  return secret;
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
      { expiresIn: "7d" },
    );

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    logger.info({ userId: user.id, email: user.email, tenantId: user.tenantId }, "User logged in");

    res.json({
      token,
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
      { expiresIn: "7d" },
    );

    logger.info({ userId: user.id, email: user.email, tenantId: tenant.id }, "User registered");

    res.status(201).json({
      token,
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

export default router;
