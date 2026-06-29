import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  tasksTable, projectsTable, contactsTable, memoriesTable,
  decisionsTable, conversationsTable, assetsTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function setDownloadHeaders(res: Response, filename: string): void {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

// ─── POST /api/export/all ───────────────────────────────────────────────────

router.post("/export/all", async (req, res) => {
  try {
    const [
      tasks,
      projects,
      contacts,
      memories,
      decisions,
      conversations,
      assets,
    ] = await Promise.all([
      db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
      db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt)),
      db.select().from(contactsTable).orderBy(desc(contactsTable.createdAt)),
      db.select().from(memoriesTable).orderBy(desc(memoriesTable.createdAt)),
      db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt)),
      db.select().from(conversationsTable).orderBy(desc(conversationsTable.createdAt)),
      db.select().from(assetsTable).orderBy(desc(assetsTable.createdAt)),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      tasks,
      projects,
      contacts,
      memories,
      decisions,
      conversations,
      assets,
    };

    const filename = `tams_export_${sanitizeFilename(new Date().toISOString())}.json`;
    setDownloadHeaders(res, filename);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    req.log.error({ err }, "Error exporting all data");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/export/markdown ──────────────────────────────────────────────

interface MarkdownExportable {
  id: number;
  title?: string | null;
  name?: string | null;
  content?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  [key: string]: unknown;
}

function itemToMarkdown(item: MarkdownExportable, type: string): string {
  const title = item.title ?? item.name ?? `${type} #${item.id}`;
  let md = `## ${title}\n\n`;
  md += `- **Type**: ${type}\n`;
  md += `- **ID**: ${item.id}\n`;
  if (item.status) md += `- **Status**: ${item.status}\n`;
  if (item.priority) md += `- **Priority**: ${item.priority}\n`;
  if (item.createdAt) md += `- **Created**: ${item.createdAt.toISOString?.() ?? item.createdAt}\n`;
  if (item.updatedAt) md += `- **Updated**: ${item.updatedAt.toISOString?.() ?? item.updatedAt}\n`;
  if (item.description) md += `\n**Description**:\n${item.description}\n`;
  if (item.content) md += `\n**Content**:\n${item.content}\n`;
  md += `\n---\n\n`;
  return md;
}

router.post("/export/markdown", async (req, res) => {
  try {
    const [tasks, projects, memories, decisions] = await Promise.all([
      db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
      db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt)),
      db.select().from(memoriesTable).orderBy(desc(memoriesTable.createdAt)),
      db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt)),
    ]);

    let md = `# TAMS Export\n\n`;
    md += `Exported: ${new Date().toISOString()}\n\n`;

    md += `# Tasks (${tasks.length})\n\n`;
    for (const t of tasks) md += itemToMarkdown(t as MarkdownExportable, "task");

    md += `# Projects (${projects.length})\n\n`;
    for (const p of projects) md += itemToMarkdown(p as MarkdownExportable, "project");

    md += `# Memories (${memories.length})\n\n`;
    for (const m of memories) md += itemToMarkdown(m as MarkdownExportable, "memory");

    md += `# Decisions (${decisions.length})\n\n`;
    for (const d of decisions) md += itemToMarkdown(d as MarkdownExportable, "decision");

    const filename = `tams_export_${sanitizeFilename(new Date().toISOString())}.md`;
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(md);
  } catch (err) {
    req.log.error({ err }, "Error exporting markdown");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/import ───────────────────────────────────────────────────────

interface ImportPayload {
  version?: string;
  tasks?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  contacts?: Array<Record<string, unknown>>;
  memories?: Array<Record<string, unknown>>;
  decisions?: Array<Record<string, unknown>>;
  conversations?: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>;
}

function stripIdAndTimestamps<T extends Record<string, unknown>>(item: T): Omit<T, "id" | "createdAt" | "updatedAt"> {
  const { id, createdAt, updatedAt, ...rest } = item;
  return rest as Omit<T, "id" | "createdAt" | "updatedAt">;
}

function normalizeItem(item: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue;
    normalized[key] = value;
  }
  return normalized;
}

router.post("/import", async (req, res) => {
  try {
    const payload: ImportPayload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Invalid payload: expected JSON object" });
    }

    const results: Record<string, { created: number; skipped: number; errors: string[] }> = {};

    // Helper to deduplicate by unique key
    async function importTable<T extends Record<string, unknown>>(
      tableName: string,
      table: any,
      items: T[] | undefined,
      uniqueKey: keyof T,
    ): Promise<void> {
      if (!items || items.length === 0) {
        results[tableName] = { created: 0, skipped: 0, errors: [] };
        return;
      }

      const existing = await db.select().from(table);
      const existingSet = new Set(existing.map((e: any) => e[uniqueKey]));

      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const raw of items) {
        const val = raw[uniqueKey];
        if (val !== undefined && val !== null && existingSet.has(val)) {
          skipped++;
          continue;
        }
        try {
          const clean = stripIdAndTimestamps(raw);
          await db.insert(table).values(normalizeItem(clean));
          created++;
          if (val !== undefined && val !== null) existingSet.add(val);
        } catch (err: any) {
          errors.push(String(err?.message ?? err));
        }
      }

      results[tableName] = { created, skipped, errors: errors.slice(0, 10) };
    }

    await importTable("tasks", tasksTable, payload.tasks, "title");
    await importTable("projects", projectsTable, payload.projects, "name");
    await importTable("contacts", contactsTable, payload.contacts, "name");
    await importTable("memories", memoriesTable, payload.memories, "title");
    await importTable("decisions", decisionsTable, payload.decisions, "title");
    await importTable("conversations", conversationsTable, payload.conversations, "title");
    await importTable("assets", assetsTable, payload.assets, "name");

    return res.json({
      success: true,
      imported: results,
    });
  } catch (err) {
    req.log.error({ err }, "Error importing data");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
