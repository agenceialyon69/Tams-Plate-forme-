import { Router } from "express";
import { db } from "@workspace/db";
import { contactsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function logActivity(type: string, title: string, description: string, entityId: number) {
  try {
    await db.insert(activityTable).values({ type: type as any, title, description, entityId });
  } catch {}
}

// LIST contacts
router.get("/contacts", async (req, res) => {
  try {
    const { status } = req.query;
    const all = await db.select().from(contactsTable).orderBy(contactsTable.createdAt);
    const filtered = status ? all.filter(c => c.status === status) : all;
    return res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Error listing contacts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE contact
router.post("/contacts", async (req, res) => {
  try {
    const { name, company, email, phone, status, notes, lastContactedAt } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const [created] = await db.insert(contactsTable).values({
      name,
      company: company ?? null,
      email: email ?? null,
      phone: phone ?? null,
      status: status ?? "prospect",
      notes: notes ?? null,
      lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null,
    }).returning();

    await logActivity("contact", name, `Contact créé : ${name}`, created.id);
    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE contact
router.patch("/contacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, company, email, phone, status, notes, lastContactedAt } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (company !== undefined) updates.company = company;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (lastContactedAt !== undefined) updates.lastContactedAt = lastContactedAt ? new Date(lastContactedAt) : null;

    const [updated] = await db.update(contactsTable).set(updates).where(eq(contactsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE contact
router.delete("/contacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
