import { Router } from "express";
import { db } from "@workspace/db";
import { contactsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logActivity } from "../lib/activity";
import { getContactRelated, suggestRelationships, autoLink } from "../lib/relationships";
import { emitContactAdded } from "../lib/workflows";
import { invalidateDashboardCache } from "../lib/cache";
import {
  CreateContactBody,
  UpdateContactBody,
  ListContactsQueryParams,
} from "@workspace/api-zod";

const router = Router();

// LIST contacts with pagination
router.get("/contacts", async (req, res) => {
  try {
    const parsedQuery = ListContactsQueryParams.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: "Invalid query parameters", details: parsedQuery.error.issues });
    }
    const { status } = parsedQuery.data;

    // Pagination
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = Number(req.query.offset) || ((page - 1) * limit);

    // Build query
    let query = db.select().from(contactsTable);
    if (status) {
      const contacts = await query.where(eq(contactsTable.status, status))
        .orderBy(contactsTable.createdAt)
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(contactsTable)
        .where(eq(contactsTable.status, status));

      const hasMore = offset + contacts.length < total;
      return res.json(contacts);
    }

    const contacts = await query
      .orderBy(contactsTable.createdAt)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(contactsTable);

    const hasMore = offset + contacts.length < total;
    return res.json(contacts);
  } catch (err) {
    req.log.error({ err }, "Error listing contacts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE contact with Zod validation
router.post("/contacts", async (req, res) => {
  try {
    const parsed = CreateContactBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, company, email, phone, status, notes, lastContactedAt } = parsed.data;

    const [created] = await db.insert(contactsTable).values({
      name,
      company: company ?? null,
      email: email ?? null,
      phone: phone ?? null,
      status: status ?? "prospect",
      notes: notes ?? null,
      lastContactedAt: lastContactedAt ?? null,
    }).returning();

    await logActivity("contact", name, `Contact créé : ${name}`, created.id);
    await emitContactAdded(created.id);
    await invalidateDashboardCache();
    return res.status(201).json({ data: created });
  } catch (err) {
    req.log.error({ err }, "Error creating contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE contact with Zod validation
router.patch("/contacts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const parsed = UpdateContactBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, company, email, phone, status, notes, lastContactedAt } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (company !== undefined) updates.company = company;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (lastContactedAt !== undefined) updates.lastContactedAt = lastContactedAt;

    const [updated] = await db.update(contactsTable).set(updates).where(eq(contactsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    await invalidateDashboardCache();
    return res.json({ data: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET related entities for a contact
router.get("/contacts/:id/related", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const related = await getContactRelated(id);
    if (!related) return res.status(404).json({ error: "Not found" });

    return res.json({ data: related });
  } catch (err) {
    req.log.error({ err }, "Error getting related contact entities");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// SUGGEST relationships for a contact
router.get("/contacts/:id/suggestions", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
    if (!contact) return res.status(404).json({ error: "Not found" });

    const suggestions = await suggestRelationships("contact", id);
    return res.json({ data: suggestions });
  } catch (err) {
    req.log.error({ err }, "Error suggesting relationships for contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// AUTO-LINK a contact
router.post("/contacts/:id/auto-link", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id)).limit(1);
    if (!contact) return res.status(404).json({ error: "Not found" });

    const linked = await autoLink("contact", id);
    await invalidateDashboardCache();
    return res.json({ data: linked });
  } catch (err) {
    req.log.error({ err }, "Error auto-linking contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE contact
router.delete("/contacts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    await invalidateDashboardCache();
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting contact");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
