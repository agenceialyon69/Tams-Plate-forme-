import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { tasksTable, projectsTable, memoriesTable, decisionsTable } from "@workspace/db";

const router = Router();

function requireAdminOrDev(req: any, res: any, next: any) {
  if (process.env.REQUIRE_AUTH === "true") {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Authentification requise" });
    if (user.role !== "admin") return res.status(403).json({ error: "Acces refuse - droits administrateur requis" });
  }
  next();
}

const RecoveryPayload = z.object({
  exportedAt: z.string().optional(),
  version: z.string().optional(),
  data: z.object({
    tasks: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    projects: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    memories: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    decisions: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  }).passthrough(),
}).passthrough();

const ImportBody = z.object({
  mode: z.enum(["dry_run", "append"]).default("dry_run"),
  payload: RecoveryPayload,
});

type RawRow = Record<string, unknown>;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function priority(value: unknown): "low" | "medium" | "high" | "urgent" {
  return value === "low" || value === "medium" || value === "high" || value === "urgent" ? value : "medium";
}

function taskStatus(value: unknown): "todo" | "in_progress" | "done" | "cancelled" {
  return value === "todo" || value === "in_progress" || value === "done" || value === "cancelled" ? value : "todo";
}

function projectStatus(value: unknown): "active" | "paused" | "completed" | "archived" {
  return value === "active" || value === "paused" || value === "completed" || value === "archived" ? value : "active";
}

function memoryType(value: unknown): "person" | "project" | "company" | "decision" | "note" | "goal" | "event" {
  return value === "person" || value === "project" || value === "company" || value === "decision" || value === "note" || value === "goal" || value === "event" ? value : "note";
}

function decisionStatus(value: unknown): "pending" | "analyzing" | "decided" | "archived" {
  return value === "pending" || value === "analyzing" || value === "decided" || value === "archived" ? value : "pending";
}

function clampCount(rows: RawRow[], max = 1000): RawRow[] {
  return rows.slice(0, max);
}

function summarize(payload: z.infer<typeof RecoveryPayload>) {
  return {
    tasks: payload.data.tasks.length,
    projects: payload.data.projects.length,
    memories: payload.data.memories.length,
    decisions: payload.data.decisions.length,
    cappedAt: 1000,
    destructive: false,
  };
}

router.get("/system/recovery/status", requireAdminOrDev, (_req, res) => {
  return res.json({
    ok: true,
    mode: "append_only_v1",
    destructiveRestore: false,
    supportedTables: ["tasks", "projects", "memories", "decisions"],
    endpoints: {
      export: "GET /api/system/export",
      validate: "POST /api/system/recovery/validate",
      import: "POST /api/system/recovery/import",
    },
    redTeam: [
      "Import v1 is append-only: no delete, no replace, no id overwrite.",
      "Dry-run is the default and should be used before append.",
      "Sensitive fields and timestamps are not trusted from the payload.",
    ],
  });
});

router.post("/system/recovery/validate", requireAdminOrDev, (req, res) => {
  const parsed = RecoveryPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid recovery payload", details: parsed.error.issues });
  return res.json({ ok: true, summary: summarize(parsed.data), warnings: parsed.data.data.tasks.length > 1000 || parsed.data.data.projects.length > 1000 || parsed.data.data.memories.length > 1000 || parsed.data.data.decisions.length > 1000 ? ["Some tables exceed the v1 cap and will be truncated to 1000 rows per table."] : [] });
});

router.post("/system/recovery/import", requireAdminOrDev, async (req, res) => {
  const parsed = ImportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid import request", details: parsed.error.issues });

  const { mode, payload } = parsed.data;
  const summary = summarize(payload);
  if (mode === "dry_run") return res.json({ ok: true, mode, summary, imported: { tasks: 0, projects: 0, memories: 0, decisions: 0 }, warnings: ["Dry-run only. Send mode=append to import sanitized rows."] });

  const imported = { tasks: 0, projects: 0, memories: 0, decisions: 0 };

  for (const row of clampCount(payload.data.projects)) {
    const name = str(row.name || row.title, "Projet restauré");
    await db.insert(projectsTable).values({ name, description: strOrNull(row.description), status: projectStatus(row.status) } as any);
    imported.projects++;
  }

  for (const row of clampCount(payload.data.tasks)) {
    const title = str(row.title, "Tâche restaurée");
    await db.insert(tasksTable).values({ title, description: strOrNull(row.description), status: taskStatus(row.status), priority: priority(row.priority), projectId: null, dueDate: strOrNull(row.dueDate) } as any);
    imported.tasks++;
  }

  for (const row of clampCount(payload.data.memories)) {
    const title = str(row.title, "Mémoire restaurée");
    await db.insert(memoriesTable).values({ title, type: memoryType(row.type), content: strOrNull(row.content), tags: arr(row.tags), relatedIds: [] } as any);
    imported.memories++;
  }

  for (const row of clampCount(payload.data.decisions)) {
    const title = str(row.title, "Décision restaurée");
    await db.insert(decisionsTable).values({ title, context: strOrNull(row.context), options: arr(row.options), advantages: arr(row.advantages), risks: arr(row.risks), aiAdvice: strOrNull(row.aiAdvice), redTeamAdvice: strOrNull(row.redTeamAdvice), result: strOrNull(row.result), learnings: strOrNull(row.learnings), status: decisionStatus(row.status), confidenceScore: typeof row.confidenceScore === "number" ? Math.max(0, Math.min(100, Math.round(row.confidenceScore))) : 50 } as any);
    imported.decisions++;
  }

  return res.json({ ok: true, mode, summary, imported, destructive: false });
});

export default router;
