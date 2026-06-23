import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.get("/profile", async (req, res) => {
  const userId = req.authUser?.id;
  if (!userId) { res.status(401).json({ error: "Non authentifié." }); return; }

  try {
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
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "Profil introuvable." }); return; }
    res.json(user);
  } catch (err) {
    logger.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/profile", async (req, res) => {
  const userId = req.authUser?.id;
  if (!userId) { res.status(401).json({ error: "Non authentifié." }); return; }

  const parse = updateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  if (!parse.data.name) {
    res.status(400).json({ error: "Aucune modification fournie." });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ name: parse.data.name, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });

    logger.info({ userId }, "Profile updated");
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/profile/change-password", async (req, res) => {
  const userId = req.authUser?.id;
  if (!userId) { res.status(401).json({ error: "Non authentifié." }); return; }

  const parse = changePasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Données invalides.", details: parse.error.flatten() });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }

    const valid = await bcrypt.compare(parse.data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Mot de passe actuel incorrect." });
      return;
    }

    const newHash = await bcrypt.hash(parse.data.newPassword, 12);
    await db
      .update(usersTable)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    logger.info({ userId }, "Password changed");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to change password");
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
