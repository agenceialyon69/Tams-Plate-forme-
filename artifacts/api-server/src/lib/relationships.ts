import { db } from "@workspace/db";
import {
  tasksTable,
  projectsTable,
  contactsTable,
  memoriesTable,
  assetsTable,
  projectContactsTable,
} from "@workspace/db";
import { eq, like, or, sql, and, inArray } from "drizzle-orm";
import { logActivity } from "./activity";

type EntityType = "task" | "project" | "contact" | "memory" | "asset";

interface Suggestion {
  entityType: EntityType;
  entityId: number;
  entityName: string;
  score: number;
  reason: string;
}

const STOP_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "en", "à", "a",
  "pour", "par", "sur", "avec", "dans", "ce", "cette", "son", "sa", "ses",
  "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "est", "sont",
  "être", "avoir", "faire", "aller", "venir", "voir", "savoir", "pouvoir",
  "the", "a", "an", "and", "or", "for", "with", "in", "on", "at", "to", "of",
  "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "can", "shall",
]);

function extractSignificantWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words));
}

function computeScore(sourceWords: string[], targetText: string): number {
  const targetWords = new Set(
    targetText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3)
  );
  if (targetWords.size === 0) return 0;
  let matches = 0;
  for (const w of sourceWords) {
    if (targetWords.has(w)) matches++;
  }
  return matches / Math.max(sourceWords.length, targetWords.size);
}

async function getEntityContent(
  entityType: EntityType,
  entityId: number
): Promise<{ title: string; description?: string | null; notes?: string | null } | null> {
  switch (entityType) {
    case "task": {
      const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, entityId)).limit(1);
      return row ? { title: row.title, description: row.description } : null;
    }
    case "project": {
      const [row] = await db.select().from(projectsTable).where(eq(projectsTable.id, entityId)).limit(1);
      return row ? { title: row.name, description: row.description } : null;
    }
    case "contact": {
      const [row] = await db.select().from(contactsTable).where(eq(contactsTable.id, entityId)).limit(1);
      return row ? { title: row.name, description: row.company, notes: row.notes } : null;
    }
    case "memory": {
      const [row] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, entityId)).limit(1);
      return row ? { title: row.title, description: row.content } : null;
    }
    case "asset": {
      const [row] = await db.select().from(assetsTable).where(eq(assetsTable.id, entityId)).limit(1);
      return row ? { title: row.name, description: row.content ?? undefined } : null;
    }
    default:
      return null;
  }
}

async function searchCandidates(
  entityType: EntityType,
  words: string[],
  excludeId?: number
): Promise<Suggestion[]> {
  if (words.length === 0) return [];
  const suggestions: Suggestion[] = [];

  // Search projects
  if (entityType !== "project") {
    const conditions = words.map(w => like(projectsTable.name, `%${w}%`));
    const rows = await db
      .select()
      .from(projectsTable)
      .where(or(...conditions))
      .limit(20);
    for (const row of rows) {
      if (excludeId !== undefined && row.id === excludeId) continue;
      const score = computeScore(words, `${row.name} ${row.description ?? ""}`);
      if (score > 0) {
        suggestions.push({ entityType: "project", entityId: row.id, entityName: row.name, score, reason: "Mots communs dans le projet" });
      }
    }
  }

  // Search contacts
  if (entityType !== "contact") {
    const conditions = words.map(w => or(
      like(contactsTable.name, `%${w}%`),
      like(contactsTable.company, `%${w}%`),
      like(contactsTable.notes, `%${w}%`)
    ));
    const rows = await db
      .select()
      .from(contactsTable)
      .where(or(...conditions))
      .limit(20);
    for (const row of rows) {
      if (excludeId !== undefined && row.id === excludeId) continue;
      const score = computeScore(words, `${row.name} ${row.company ?? ""} ${row.notes ?? ""}`);
      if (score > 0) {
        suggestions.push({ entityType: "contact", entityId: row.id, entityName: row.name, score, reason: "Mots communs dans le contact" });
      }
    }
  }

  // Search tasks
  if (entityType !== "task") {
    const conditions = words.map(w => or(
      like(tasksTable.title, `%${w}%`),
      like(tasksTable.description, `%${w}%`)
    ));
    const rows = await db
      .select()
      .from(tasksTable)
      .where(or(...conditions))
      .limit(20);
    for (const row of rows) {
      if (excludeId !== undefined && row.id === excludeId) continue;
      const score = computeScore(words, `${row.title} ${row.description ?? ""}`);
      if (score > 0) {
        suggestions.push({ entityType: "task", entityId: row.id, entityName: row.title, score, reason: "Mots communs dans la tâche" });
      }
    }
  }

  // Search memories
  if (entityType !== "memory") {
    const conditions = words.map(w => or(
      like(memoriesTable.title, `%${w}%`),
      like(memoriesTable.content, `%${w}%`)
    ));
    const rows = await db
      .select()
      .from(memoriesTable)
      .where(or(...conditions))
      .limit(20);
    for (const row of rows) {
      if (excludeId !== undefined && row.id === excludeId) continue;
      const score = computeScore(words, `${row.title} ${row.content ?? ""}`);
      if (score > 0) {
        suggestions.push({ entityType: "memory", entityId: row.id, entityName: row.title, score, reason: "Mots communs dans la mémoire" });
      }
    }
  }

  // Search assets
  if (entityType !== "asset") {
    const conditions = words.map(w => or(
      like(assetsTable.name, `%${w}%`),
      like(assetsTable.content, `%${w}%`)
    ));
    const rows = await db
      .select()
      .from(assetsTable)
      .where(or(...conditions))
      .limit(20);
    for (const row of rows) {
      if (excludeId !== undefined && row.id === excludeId) continue;
      const score = computeScore(words, `${row.name} ${row.content ?? ""}`);
      if (score > 0) {
        suggestions.push({ entityType: "asset", entityId: row.id, entityName: row.name, score, reason: "Mots communs dans l'asset" });
      }
    }
  }

  // Deduplicate by entityType+entityId keeping highest score
  const map = new Map<string, Suggestion>();
  for (const s of suggestions) {
    const key = `${s.entityType}:${s.entityId}`;
    const existing = map.get(key);
    if (!existing || s.score > existing.score) map.set(key, s);
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export async function suggestRelationships(
  entityType: EntityType,
  entityId: number
): Promise<Suggestion[]> {
  const content = await getEntityContent(entityType, entityId);
  if (!content) return [];
  const text = `${content.title} ${content.description ?? ""} ${content.notes ?? ""}`;
  const words = extractSignificantWords(text);
  return searchCandidates(entityType, words, entityId);
}

export async function autoLink(entityType: EntityType, entityId: number): Promise<Suggestion[]> {
  const suggestions = await suggestRelationships(entityType, entityId);
  const linked: Suggestion[] = [];

  for (const s of suggestions) {
    if (s.score < 0.7) continue;

    // Create implicit links based on entity types
    if (entityType === "task" && s.entityType === "project") {
      await db.update(tasksTable).set({ projectId: s.entityId }).where(eq(tasksTable.id, entityId));
      await logActivity("task", "Lien automatique", `Tâche liée au projet "${s.entityName}"`, entityId);
      linked.push(s);
    } else if (entityType === "task" && s.entityType === "contact") {
      // No direct column; log activity as implicit link
      await logActivity("task", "Lien implicite", `Tâche mentionne le contact "${s.entityName}"`, entityId);
      linked.push(s);
    } else if (entityType === "project" && s.entityType === "contact") {
      // Create explicit project_contacts link
      const [existing] = await db
        .select()
        .from(projectContactsTable)
        .where(and(
          eq(projectContactsTable.projectId, entityId),
          eq(projectContactsTable.contactId, s.entityId)
        ))
        .limit(1);
      if (!existing) {
        await db.insert(projectContactsTable).values({ projectId: entityId, contactId: s.entityId });
        await logActivity("project", "Lien automatique", `Projet lié au contact "${s.entityName}"`, entityId);
        linked.push(s);
      }
    } else if (entityType === "contact" && s.entityType === "project") {
      const [existing] = await db
        .select()
        .from(projectContactsTable)
        .where(and(
          eq(projectContactsTable.projectId, s.entityId),
          eq(projectContactsTable.contactId, entityId)
        ))
        .limit(1);
      if (!existing) {
        await db.insert(projectContactsTable).values({ projectId: s.entityId, contactId: entityId });
        await logActivity("contact", "Lien automatique", `Contact lié au projet "${s.entityName}"`, entityId);
        linked.push(s);
      }
    } else if (entityType === "memory" && s.entityType === "project") {
      const [mem] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, entityId)).limit(1);
      if (mem) {
        const related = (mem.relatedIds as number[]) ?? [];
        if (!related.includes(s.entityId)) {
          await db.update(memoriesTable)
            .set({ relatedIds: [...related, s.entityId] })
            .where(eq(memoriesTable.id, entityId));
          await logActivity("memory", "Lien automatique", `Mémoire liée au projet "${s.entityName}"`, entityId);
          linked.push(s);
        }
      }
    } else if (entityType === "memory" && s.entityType === "contact") {
      const [mem] = await db.select().from(memoriesTable).where(eq(memoriesTable.id, entityId)).limit(1);
      if (mem) {
        const related = (mem.relatedIds as number[]) ?? [];
        if (!related.includes(s.entityId)) {
          await db.update(memoriesTable)
            .set({ relatedIds: [...related, s.entityId] })
            .where(eq(memoriesTable.id, entityId));
          await logActivity("memory", "Lien automatique", `Mémoire liée au contact "${s.entityName}"`, entityId);
          linked.push(s);
        }
      }
    } else {
      // Generic implicit link via activity log
      await logActivity(entityType, "Lien implicite", `${entityType} lié à ${s.entityType} "${s.entityName}"`, entityId);
      linked.push(s);
    }
  }

  return linked;
}

export async function getProjectRelated(projectId: number) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project) return null;

  const tasks = await db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId));

  const contactLinks = await db
    .select({ contactId: projectContactsTable.contactId })
    .from(projectContactsTable)
    .where(eq(projectContactsTable.projectId, projectId));
  const contactIds = contactLinks.map(c => c.contactId);
  const contacts = contactIds.length
    ? await db.select().from(contactsTable).where(inArray(contactsTable.id, contactIds))
    : [];

  // Find memories that mention this project in title/content or have relatedIds
  const memByRelated = await db.select().from(memoriesTable).where(
    sql`${memoriesTable.relatedIds} @> ${JSON.stringify([projectId])}::jsonb`
  );
  const memByText = await db
    .select()
    .from(memoriesTable)
    .where(or(
      like(memoriesTable.title, `%${project.name}%`),
      like(memoriesTable.content, `%${project.name}%`)
    ));
  const memoryMap = new Map<number, (typeof memByRelated)[0]>();
  for (const m of memByRelated) memoryMap.set(m.id, m);
  for (const m of memByText) memoryMap.set(m.id, m);
  const memories = Array.from(memoryMap.values());

  // Find assets that mention project name
  const assets = await db
    .select()
    .from(assetsTable)
    .where(or(
      like(assetsTable.name, `%${project.name}%`),
      like(assetsTable.content, `%${project.name}%`)
    ));

  return { project, tasks, contacts, memories, assets };
}

export async function getContactRelated(contactId: number) {
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
  if (!contact) return null;

  const projectLinks = await db
    .select({ projectId: projectContactsTable.projectId })
    .from(projectContactsTable)
    .where(eq(projectContactsTable.contactId, contactId));
  const projectIds = projectLinks.map(p => p.projectId);
  const projects = projectIds.length
    ? await db.select().from(projectsTable).where(inArray(projectsTable.id, projectIds))
    : [];

  // Tasks mentioning this contact
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(or(
      like(tasksTable.title, `%${contact.name}%`),
      like(tasksTable.description, `%${contact.name}%`)
    ));

  // Memories mentioning this contact
  const memories = await db
    .select()
    .from(memoriesTable)
    .where(or(
      like(memoriesTable.title, `%${contact.name}%`),
      like(memoriesTable.content, `%${contact.name}%`)
    ));

  return { contact, projects, tasks, memories };
}
