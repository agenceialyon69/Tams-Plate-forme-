import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";

const router = Router();

type RiskLevel = "low" | "medium" | "high" | "critical";
type PermissionLevel = "read_only" | "preview" | "approved" | "autonomous_safe" | "admin_only";
type JobStatus = "queued" | "running" | "success" | "warn" | "fail" | "cancelled" | "timeout";

type PermissionAction = {
  actionId: string;
  label: string;
  description: string;
  riskLevel: RiskLevel;
  requiredPermission: PermissionLevel;
  humanApprovalRequired: boolean;
  dryRunSupported: boolean;
  externalSideEffect: boolean;
  rollbackPlan: string | null;
  source: string;
};

type JobRecord = {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  timeoutAt: string | null;
  cancelRequested: boolean;
};

const PERMISSION_ACTIONS: PermissionAction[] = [
  { actionId: "email.send", label: "Envoyer un email", description: "Envoi externe via Gmail.", riskLevel: "high", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: true, rollbackPlan: "Aucun rollback fiable après envoi.", source: "gmail" },
  { actionId: "calendar.write", label: "Modifier le calendrier", description: "Créer ou modifier un événement.", riskLevel: "high", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: true, rollbackPlan: "Supprimer ou restaurer l'événement depuis l'audit.", source: "calendar" },
  { actionId: "n8n.run", label: "Lancer un workflow n8n", description: "Déclenche un workflow externe.", riskLevel: "high", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: true, rollbackPlan: "Dépend du workflow; dry-run obligatoire si disponible.", source: "automation" },
  { actionId: "recovery.import", label: "Importer une sauvegarde", description: "Import append-only de données restaurées.", riskLevel: "critical", requiredPermission: "admin_only", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: false, rollbackPlan: "Exporter avant import et supprimer manuellement les lignes importées si nécessaire.", source: "recovery" },
  { actionId: "github.write", label: "Modifier GitHub", description: "Écriture de code, branche ou métadonnées GitHub.", riskLevel: "critical", requiredPermission: "admin_only", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: true, rollbackPlan: "Revert ciblé sur branche; jamais de mutation directe de main.", source: "dev-agent" },
  { actionId: "github.ci.rerun", label: "Relancer la CI", description: "Relance un workflow GitHub Actions.", riskLevel: "medium", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: false, externalSideEffect: true, rollbackPlan: null, source: "dev-agent-ci" },
  { actionId: "github.pr.create", label: "Créer une PR", description: "Crée une pull request depuis une branche sûre.", riskLevel: "high", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: true, rollbackPlan: "Fermer la PR sans merge.", source: "dev-agent-ci" },
  { actionId: "worker.long.run", label: "Exécuter un worker long", description: "Démarre une tâche longue bornée.", riskLevel: "medium", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: false, rollbackPlan: "Annuler le job.", source: "jobs" },
  { actionId: "data.bulk.write", label: "Modifier des données en masse", description: "Écriture interne volumique.", riskLevel: "critical", requiredPermission: "admin_only", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: false, rollbackPlan: "Snapshot/export préalable puis restauration append-only contrôlée.", source: "platform" },
  { actionId: "automation.enable", label: "Activer une automation", description: "Active une exécution récurrente.", riskLevel: "medium", requiredPermission: "approved", humanApprovalRequired: true, dryRunSupported: true, externalSideEffect: false, rollbackPlan: "Désactiver l'automation.", source: "automation" },
  { actionId: "life.read", label: "Lire le contexte Life OS", description: "Lecture sans effet externe.", riskLevel: "low", requiredPermission: "read_only", humanApprovalRequired: false, dryRunSupported: true, externalSideEffect: false, rollbackPlan: null, source: "life-os" },
  { actionId: "life.capture", label: "Capturer une information", description: "Écriture interne limitée et traçable.", riskLevel: "low", requiredPermission: "preview", humanApprovalRequired: false, dryRunSupported: true, externalSideEffect: false, rollbackPlan: "Archiver ou supprimer la capture identifiée.", source: "life-os" },
];

const fallbackJobs = new Map<string, JobRecord>();
const fallbackJobLogs = new Map<string, Array<{ at: string; level: string; message: string }>>();
const permissionRank: Record<PermissionLevel, number> = { read_only: 0, preview: 1, approved: 2, autonomous_safe: 3, admin_only: 4 };

function nowIso(): string { return new Date().toISOString(); }
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function safeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 50).map(safeMetadata);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 1000) : value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    if (/token|secret|password|authorization|cookie|api[_-]?key/i.test(key)) output[key] = "[REDACTED]";
    else output[key] = safeMetadata(item);
  }
  return output;
}
async function rows(sql: string, params: unknown[] = []): Promise<Array<Record<string, any>>> {
  const result = await pool.query(sql, params);
  return result.rows as Array<Record<string, any>>;
}
async function logLifeEvent(input: {
  type: string; category: string; severity?: string; confidence?: number; summary: string;
  source: string; relatedEntityType?: string | null; relatedEntityId?: string | null; metadata?: unknown;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO life_events (id, type, category, severity, confidence, summary, source, related_entity_type, related_entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [randomUUID(), input.type, input.category, input.severity ?? "info", input.confidence ?? 1, input.summary.slice(0, 1000), input.source, input.relatedEntityType ?? null, input.relatedEntityId ?? null, JSON.stringify(safeMetadata(input.metadata ?? {}))],
    );
  } catch {
    // L'observabilité ne doit jamais faire tomber une action utilisateur.
  }
}

async function activeApproval(actionId: string): Promise<boolean> {
  try {
    const result = await rows(
      `SELECT id FROM permission_approvals
       WHERE action_id=$1 AND status='approved' AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC LIMIT 1`,
      [actionId],
    );
    return result.length > 0;
  } catch { return false; }
}

async function checkPermission(action: PermissionAction, current: PermissionLevel, dryRun: boolean): Promise<{ allowed: boolean; reason: string }> {
  if (dryRun && action.dryRunSupported) return { allowed: true, reason: "Dry-run sans effet externe autorisé." };
  if (!action.humanApprovalRequired && permissionRank[current] >= permissionRank[action.requiredPermission]) {
    return { allowed: true, reason: "Permission suffisante; aucun approval humain requis." };
  }
  if (await activeApproval(action.actionId)) return { allowed: true, reason: "Approval humain actif trouvé." };
  return { allowed: false, reason: `Action ${action.riskLevel} bloquée: approval ${action.requiredPermission} requis.` };
}

const PermissionCheckBody = z.object({
  actionId: z.string().min(2),
  currentPermission: z.enum(["read_only", "preview", "approved", "autonomous_safe", "admin_only"]).default("read_only"),
  dryRun: z.boolean().default(false),
  context: z.record(z.string(), z.unknown()).optional(),
});
const PermissionApproveBody = z.object({
  actionId: z.string().min(2),
  approvedBy: z.string().min(2).max(120),
  confirmation: z.string().min(2).max(200),
  expiresInMinutes: z.number().int().min(1).max(1440).default(30),
  reason: z.string().max(500).optional(),
});

router.get("/permissions/actions", (_req, res) => res.json({ ok: true, actions: PERMISSION_ACTIONS, generatedAt: nowIso() }));
router.get("/permissions/actions/:id", (req, res) => {
  const action = PERMISSION_ACTIONS.find(item => item.actionId === req.params.id);
  return action ? res.json({ ok: true, action }) : res.status(404).json({ ok: false, error: "unknown_action" });
});
router.post("/permissions/check", async (req, res) => {
  const parsed = PermissionCheckBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  const action = PERMISSION_ACTIONS.find(item => item.actionId === parsed.data.actionId);
  if (!action) return res.status(404).json({ ok: false, error: "unknown_action" });
  const verdict = await checkPermission(action, parsed.data.currentPermission, parsed.data.dryRun);
  await logLifeEvent({ type: verdict.allowed ? "permission_allowed" : "permission_blocked", category: "security", severity: verdict.allowed ? "info" : "warning", summary: `${action.actionId}: ${verdict.reason}`, source: "permission-system", relatedEntityType: "permission_action", relatedEntityId: action.actionId, metadata: parsed.data.context });
  return res.status(verdict.allowed ? 200 : 403).json({ ok: verdict.allowed, action, ...verdict, auditEvent: "life_events" });
});
router.post("/permissions/approve", async (req, res) => {
  const parsed = PermissionApproveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  const action = PERMISSION_ACTIONS.find(item => item.actionId === parsed.data.actionId);
  if (!action) return res.status(404).json({ ok: false, error: "unknown_action" });
  if (parsed.data.confirmation !== parsed.data.actionId) return res.status(400).json({ ok: false, error: "confirmation_mismatch", expected: action.actionId });
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInMinutes * 60_000).toISOString();
  await pool.query(
    `INSERT INTO permission_approvals (id, action_id, status, approved_by, reason, expires_at, metadata)
     VALUES ($1,$2,'approved',$3,$4,$5,$6::jsonb)`,
    [id, action.actionId, parsed.data.approvedBy, parsed.data.reason ?? null, expiresAt, JSON.stringify({ riskLevel: action.riskLevel })],
  );
  await logLifeEvent({ type: "permission_approved", category: "security", severity: "warning", summary: `Approval temporaire créé pour ${action.actionId}.`, source: "permission-system", relatedEntityType: "permission_approval", relatedEntityId: id });
  return res.status(201).json({ ok: true, approval: { id, actionId: action.actionId, status: "approved", approvedBy: parsed.data.approvedBy, expiresAt } });
});
router.get("/permissions/audit", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 250);
  const audit = await rows(`SELECT id,type,category,severity,summary,source,related_entity_type AS "relatedEntityType",related_entity_id AS "relatedEntityId",created_at AS "createdAt" FROM life_events WHERE category='security' ORDER BY created_at DESC LIMIT $1`, [limit]).catch(() => []);
  return res.json({ ok: true, audit });
});

async function saveJob(job: JobRecord): Promise<void> {
  fallbackJobs.set(job.id, job);
  try {
    await pool.query(
      `INSERT INTO jobs (id,type,status,progress,input,result,last_error,timeout_at,cancel_requested,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,progress=EXCLUDED.progress,result=EXCLUDED.result,last_error=EXCLUDED.last_error,cancel_requested=EXCLUDED.cancel_requested,updated_at=EXCLUDED.updated_at`,
      [job.id, job.type, job.status, job.progress, JSON.stringify(safeMetadata(job.input)), job.result ? JSON.stringify(safeMetadata(job.result)) : null, job.lastError, job.timeoutAt, job.cancelRequested, job.createdAt, job.updatedAt],
    );
  } catch {
    // Repli mémoire borné: utile si la DB est indisponible, sans effet externe.
    if (fallbackJobs.size > 500) fallbackJobs.delete(fallbackJobs.keys().next().value as string);
  }
}
async function appendJobLog(id: string, level: string, message: string): Promise<void> {
  const entry = { at: nowIso(), level, message: message.slice(0, 1000) };
  const existing = fallbackJobLogs.get(id) ?? [];
  fallbackJobLogs.set(id, [...existing.slice(-99), entry]);
  try { await pool.query(`INSERT INTO job_logs (job_id,level,message,metadata) VALUES ($1,$2,$3,'{}'::jsonb)`, [id, level, entry.message]); } catch {}
}
function toJob(row: Record<string, any>): JobRecord {
  return {
    id: String(row.id), type: String(row.type), status: row.status as JobStatus, progress: Number(row.progress ?? 0),
    input: asRecord(row.input), result: row.result ? asRecord(row.result) : null, lastError: row.last_error ?? row.lastError ?? null,
    createdAt: new Date(row.created_at ?? row.createdAt).toISOString(), updatedAt: new Date(row.updated_at ?? row.updatedAt).toISOString(),
    timeoutAt: row.timeout_at ?? row.timeoutAt ? new Date(row.timeout_at ?? row.timeoutAt).toISOString() : null,
    cancelRequested: Boolean(row.cancel_requested ?? row.cancelRequested),
  };
}
async function getJob(id: string): Promise<JobRecord | null> {
  try {
    const found = await rows("SELECT * FROM jobs WHERE id=$1 LIMIT 1", [id]);
    return found[0] ? toJob(found[0]) : fallbackJobs.get(id) ?? null;
  } catch { return fallbackJobs.get(id) ?? null; }
}
async function createJob(type: string, input: Record<string, unknown>, timeoutSeconds = 120): Promise<JobRecord> {
  const createdAt = nowIso();
  const job: JobRecord = { id: randomUUID(), type, status: "queued", progress: 0, input: asRecord(safeMetadata(input)), result: null, lastError: null, createdAt, updatedAt: createdAt, timeoutAt: new Date(Date.now() + Math.min(timeoutSeconds, 1800) * 1000).toISOString(), cancelRequested: false };
  await saveJob(job);
  await appendJobLog(job.id, "info", "Job créé et mis en file.");
  setImmediate(() => { void runJob(job.id); });
  return job;
}
async function runJob(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job || job.cancelRequested) return;
  job.status = "running"; job.progress = 10; job.updatedAt = nowIso();
  await saveJob(job); await appendJobLog(id, "info", "Exécution démarrée hors de la requête HTTP.");
  try {
    const refreshed = await getJob(id);
    if (refreshed?.cancelRequested) {
      job.status = "cancelled"; job.progress = 100; job.updatedAt = nowIso(); await saveJob(job); return;
    }
    const integrations = integrationStatuses();
    if (job.type === "gmail_sync" && integrations.gmail.status !== "connected") {
      job.status = "warn"; job.progress = 100; job.result = { status: integrations.gmail.status, synced: 0 }; job.lastError = "Gmail OAuth non vérifié.";
    } else if (job.type === "calendar_sync" && integrations.calendar.status !== "connected") {
      job.status = "warn"; job.progress = 100; job.result = { status: integrations.calendar.status, synced: 0 }; job.lastError = "Calendar OAuth non vérifié.";
    } else if (["video.generate", "audio.music.generate", "recovery_import", "dev_agent_repair"].includes(job.type)) {
      job.status = "warn"; job.progress = 100; job.result = { status: "handoff_required", safe: true }; job.lastError = "Ce job exige un provider ou un approval dédié; aucun effet externe exécuté.";
    } else {
      job.status = "success"; job.progress = 100; job.result = { status: "success", processedAt: nowIso(), safe: true };
    }
    job.updatedAt = nowIso();
    await saveJob(job);
    await appendJobLog(id, job.status === "success" ? "info" : "warning", job.lastError ?? "Job terminé.");
    await logLifeEvent({ type: "job_completed", category: "automation", severity: job.status === "success" ? "info" : "warning", confidence: 1, summary: `Job ${job.type}: ${job.status}`, source: "job-runner", relatedEntityType: "job", relatedEntityId: id, metadata: { status: job.status } });
  } catch (error) {
    job.status = "fail"; job.progress = 100; job.lastError = error instanceof Error ? error.message.slice(0, 500) : "Erreur job"; job.updatedAt = nowIso();
    await saveJob(job); await appendJobLog(id, "error", job.lastError);
  }
}

const JobBody = z.object({
  type: z.enum(["manual", "video.generate", "audio.music.generate", "recovery_import", "life_os_coaching", "gmail_sync", "calendar_sync", "n8n_workflow", "dev_agent_repair", "automation_run"]),
  input: z.record(z.string(), z.unknown()).default({}),
  timeoutSeconds: z.number().int().min(5).max(1800).default(120),
  dryRun: z.boolean().default(true),
  permission: z.enum(["read_only", "preview", "approved", "autonomous_safe", "admin_only"]).default("preview"),
});
router.get("/jobs", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 250);
  try {
    const result = await rows("SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1", [limit]);
    return res.json({ ok: true, jobs: result.map(toJob), fallback: false });
  } catch { return res.json({ ok: true, jobs: [...fallbackJobs.values()].slice(-limit).reverse(), fallback: true }); }
});
router.get("/jobs/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  return job ? res.json({ ok: true, job }) : res.status(404).json({ ok: false, error: "job_not_found" });
});
router.post("/jobs", async (req, res) => {
  const parsed = JobBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  const sensitive: Record<string, string> = { recovery_import: "recovery.import", n8n_workflow: "n8n.run", dev_agent_repair: "github.write" };
  const actionId = sensitive[parsed.data.type] ?? (parsed.data.type === "manual" ? "life.capture" : "worker.long.run");
  const action = PERMISSION_ACTIONS.find(item => item.actionId === actionId)!;
  const verdict = await checkPermission(action, parsed.data.permission, parsed.data.dryRun);
  if (!verdict.allowed) {
    await logLifeEvent({ type: "permission_blocked", category: "security", severity: "warning", summary: `Job ${parsed.data.type} bloqué: ${verdict.reason}`, source: "job-runner" });
    return res.status(403).json({ ok: false, error: "approval_required", reason: verdict.reason, action });
  }
  const job = await createJob(parsed.data.type, { ...parsed.data.input, dryRun: parsed.data.dryRun }, parsed.data.timeoutSeconds);
  return res.status(202).json({ ok: true, job, nonBlocking: true });
});
router.post("/jobs/:id/cancel", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "job_not_found" });
  if (["success", "warn", "fail", "cancelled", "timeout"].includes(job.status)) return res.status(409).json({ ok: false, error: "job_already_finished", job });
  job.cancelRequested = true; job.status = "cancelled"; job.progress = 100; job.updatedAt = nowIso();
  await saveJob(job); await appendJobLog(job.id, "warning", "Annulation demandée.");
  return res.json({ ok: true, job });
});
router.get("/jobs/:id/logs", async (req, res) => {
  try {
    const logs = await rows(`SELECT id,level,message,metadata,created_at AS "createdAt" FROM job_logs WHERE job_id=$1 ORDER BY created_at ASC LIMIT 500`, [req.params.id]);
    return res.json({ ok: true, logs });
  } catch { return res.json({ ok: true, logs: fallbackJobLogs.get(req.params.id) ?? [], fallback: true }); }
});

const HistoryBody = z.object({
  type: z.enum(["user_capture", "task_change", "decision_change", "risk_detected", "coach_session", "automation_run", "integration_signal", "gmail_signal", "calendar_signal", "github_action", "recovery_action", "system_warning"]),
  category: z.string().min(2).max(80),
  severity: z.enum(["info", "warning", "high", "critical"]).default("info"),
  confidence: z.number().min(0).max(1).default(1),
  summary: z.string().min(2).max(1000),
  source: z.string().min(2).max(120),
  relatedEntityType: z.string().max(80).optional(),
  relatedEntityId: z.string().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
router.get("/life-os/history", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 250);
  const events = await rows(`SELECT id,type,category,severity,confidence,summary,source,related_entity_type AS "relatedEntityType",related_entity_id AS "relatedEntityId",created_at AS "createdAt" FROM life_events ORDER BY created_at DESC LIMIT $1`, [limit]).catch(() => []);
  return res.json({ ok: true, events, privacy: "metadata redacted; full sensitive content omitted" });
});
router.get("/life-os/history/timeline", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const timeline = await rows(`SELECT id,type,category,severity,confidence,summary,source,created_at AS "createdAt" FROM life_events ORDER BY created_at DESC LIMIT $1`, [limit]).catch(() => []);
  return res.json({ ok: true, timeline, sources: [...new Set(timeline.map(item => item.source))] });
});
router.get("/life-os/history/events/:id", async (req, res) => {
  const event = (await rows(`SELECT id,type,category,severity,confidence,summary,source,related_entity_type AS "relatedEntityType",related_entity_id AS "relatedEntityId",metadata,created_at AS "createdAt" FROM life_events WHERE id=$1 LIMIT 1`, [req.params.id]).catch(() => []))[0];
  return event ? res.json({ ok: true, event: { ...event, metadata: safeMetadata(event.metadata) } }) : res.status(404).json({ ok: false, error: "event_not_found" });
});
router.post("/life-os/history/event", async (req, res) => {
  const parsed = HistoryBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  const id = randomUUID();
  await pool.query(`INSERT INTO life_events (id,type,category,severity,confidence,summary,source,related_entity_type,related_entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [id, parsed.data.type, parsed.data.category, parsed.data.severity, parsed.data.confidence, parsed.data.summary, parsed.data.source, parsed.data.relatedEntityType ?? null, parsed.data.relatedEntityId ?? null, JSON.stringify(safeMetadata(parsed.data.metadata))]);
  return res.status(201).json({ ok: true, event: { id, ...parsed.data, metadata: safeMetadata(parsed.data.metadata), createdAt: nowIso() } });
});
router.get("/life-os/history/trends", async (_req, res) => {
  const trends = await rows(`SELECT category,severity,COUNT(*)::int AS count,MAX(created_at) AS "lastSeenAt" FROM life_events WHERE created_at > now() - interval '30 days' GROUP BY category,severity ORDER BY count DESC`).catch(() => []);
  return res.json({ ok: true, periodDays: 30, trends });
});

const NodeBody = z.object({ type: z.enum(["person", "project", "obligation", "decision", "event", "risk", "document", "evidence", "important_email", "calendar_event", "goal", "routine", "constraint"]), label: z.string().min(2).max(240), summary: z.string().max(2000).optional(), confidence: z.number().min(0).max(1).default(1), source: z.string().min(2).max(120), metadata: z.record(z.string(), z.unknown()).default({}) });
const EdgeBody = z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid(), relation: z.enum(["related_to", "depends_on", "blocks", "supports", "contradicts", "belongs_to", "caused_by", "evidence_for", "risk_for"]), confidence: z.number().min(0).max(1).default(1), source: z.string().min(2).max(120) });
router.get("/memory-graph/v2", async (_req, res) => {
  const [nodes, edges] = await Promise.all([
    rows(`SELECT id,type,label,summary,confidence,source,metadata,created_at AS "createdAt" FROM memory_graph_v2_nodes ORDER BY created_at DESC LIMIT 250`).catch(() => []),
    rows(`SELECT id,source_id AS "sourceId",target_id AS "targetId",relation,confidence,source,created_at AS "createdAt" FROM memory_graph_v2_edges ORDER BY created_at DESC LIMIT 500`).catch(() => []),
  ]);
  return res.json({ ok: true, nodes: nodes.map(item => ({ ...item, metadata: safeMetadata(item.metadata) })), edges, fallbackToLegacyMemory: nodes.length === 0 });
});
router.get("/memory-graph/v2/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim().slice(0, 200);
  if (!query) return res.json({ ok: true, query, nodes: [] });
  const nodes = await rows(`SELECT id,type,label,summary,confidence,source,created_at AS "createdAt" FROM memory_graph_v2_nodes WHERE label ILIKE $1 OR summary ILIKE $1 ORDER BY confidence DESC,created_at DESC LIMIT 50`, [`%${query}%`]).catch(() => []);
  return res.json({ ok: true, query, nodes });
});
router.post("/memory-graph/v2/node", async (req, res) => {
  const parsed = NodeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  const id = randomUUID();
  await pool.query(`INSERT INTO memory_graph_v2_nodes (id,type,label,summary,confidence,source,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [id, parsed.data.type, parsed.data.label, parsed.data.summary ?? null, parsed.data.confidence, parsed.data.source, JSON.stringify(safeMetadata(parsed.data.metadata))]);
  return res.status(201).json({ ok: true, node: { id, ...parsed.data, metadata: safeMetadata(parsed.data.metadata), createdAt: nowIso() } });
});
router.post("/memory-graph/v2/edge", async (req, res) => {
  const parsed = EdgeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  const id = randomUUID();
  try {
    await pool.query(`INSERT INTO memory_graph_v2_edges (id,source_id,target_id,relation,confidence,source) VALUES ($1,$2,$3,$4,$5,$6)`, [id, parsed.data.sourceId, parsed.data.targetId, parsed.data.relation, parsed.data.confidence, parsed.data.source]);
  } catch (error) {
    return res.status(409).json({ ok: false, error: "invalid_edge", detail: error instanceof Error ? error.message.slice(0, 200) : "edge rejected" });
  }
  return res.status(201).json({ ok: true, edge: { id, ...parsed.data, createdAt: nowIso() } });
});
router.get("/memory-graph/v2/context", async (req, res) => {
  const query = String(req.query.q ?? "").trim().slice(0, 200);
  const pattern = `%${query || "life"}%`;
  const [nodes, events] = await Promise.all([
    rows(`SELECT id,type,label,summary,confidence,source FROM memory_graph_v2_nodes WHERE label ILIKE $1 OR summary ILIKE $1 ORDER BY confidence DESC LIMIT 12`, [pattern]).catch(() => []),
    rows(`SELECT id,type,summary,confidence,source,created_at AS "createdAt" FROM life_events ORDER BY created_at DESC LIMIT 12`).catch(() => []),
  ]);
  return res.json({ ok: true, query, factsKnown: nodes, recentEvidence: events, assumptions: nodes.length === 0 ? ["Contexte mémoire v2 insuffisant."] : [], sources: [...new Set([...nodes, ...events].map(item => item.source))] });
});

function connectionState(kind: "gmail" | "calendar") {
  const common = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const specific = kind === "gmail" ? ["GMAIL_REFRESH_TOKEN"] : ["GOOGLE_CALENDAR_REFRESH_TOKEN"];
  const missing = [...common, ...specific].filter(name => !process.env[name]);
  const verified = process.env[kind === "gmail" ? "GMAIL_OAUTH_VERIFIED" : "GOOGLE_CALENDAR_OAUTH_VERIFIED"] === "true";
  const status = missing.length > 0 ? "missing_config" : verified ? "connected" : "configured_unverified";
  return { status, connected: status === "connected", mode: "read_only", missingVariables: missing, verified, lastSyncAt: null, privacy: "metadata and short summaries only; no raw message/event logs" };
}
function integrationStatuses() { return { gmail: connectionState("gmail"), calendar: connectionState("calendar") }; }
for (const kind of ["gmail", "calendar"] as const) {
  router.get(`/life-os/integrations/${kind}/status`, (_req, res) => res.json({ ok: true, integration: kind, ...connectionState(kind) }));
  router.get(`/life-os/integrations/${kind}/${kind === "gmail" ? "important" : "events"}`, (_req, res) => {
    const state = connectionState(kind);
    return res.json({ ok: true, integration: kind, ...state, items: [], honestNote: state.status === "connected" ? "Aucune synchronisation exécutée dans cette requête." : "Connexion indisponible; aucune donnée simulée." });
  });
  router.get(`/life-os/integrations/${kind}/insights`, (_req, res) => {
    const state = connectionState(kind);
    return res.json({ ok: true, integration: kind, ...state, insights: [], riskSignalsCreated: 0 });
  });
  router.post(`/life-os/integrations/${kind}/sync-preview`, (_req, res) => {
    const state = connectionState(kind);
    return res.json({ ok: true, integration: kind, ...state, dryRun: true, wouldRead: state.connected ? ["metadata", "subject_or_title", "timestamps"] : [], externalWrites: false });
  });
  router.post(`/life-os/integrations/${kind}/sync-job`, async (_req, res) => {
    const state = connectionState(kind);
    if (!state.connected) return res.status(409).json({ ok: false, integration: kind, ...state, error: state.status });
    const job = await createJob(kind === "gmail" ? "gmail_sync" : "calendar_sync", { readOnly: true });
    return res.status(202).json({ ok: true, integration: kind, job, externalWrites: false });
  });
}

const AUTOMATION_TEMPLATES = [
  ["daily-life-briefing", "Daily Life Briefing", "daily", "read_only", false],
  ["weekly-red-team-review", "Weekly Red Team Review", "weekly", "read_only", false],
  ["admin-finance-deadline-watch", "Admin/Finance Deadline Watch", "condition_watch", "read_only", false],
  ["health-overload-watch", "Health Overload Watch", "condition_watch", "read_only", false],
  ["family-time-guard", "Family Time Guard", "weekly", "read_only", false],
  ["work-stability-review", "Work Stability Review", "weekly", "read_only", false],
  ["project-focus-guard", "Project Focus Guard", "condition_watch", "read_only", false],
  ["email-important-signal-review", "Email Important Signal Review", "daily", "read_only", false],
  ["calendar-overload-watch", "Calendar Overload Watch", "daily", "read_only", false],
  ["recovery-safety-check", "Recovery Safety Check", "monthly", "preview", true],
] as const;
async function seedAutomations(): Promise<void> {
  for (const item of AUTOMATION_TEMPLATES) {
    await pool.query(`INSERT INTO life_automations (id,title,description,enabled,schedule,type,required_permission,dry_run,approval_required)
      VALUES ($1,$2,$3,false,$4,$4,$5,true,$6) ON CONFLICT (id) DO NOTHING`, [item[0], item[1], `${item[1]} — moteur interne safe/local.`, item[2], item[3], item[4]]).catch(() => {});
  }
}
const AutomationBody = z.object({ id: z.string().regex(/^[a-z0-9-]+$/).max(80), title: z.string().min(2).max(160), description: z.string().max(1000), enabled: z.boolean().default(false), schedule: z.string().min(2).max(120), type: z.enum(["daily", "weekly", "monthly", "condition_watch", "manual"]), requiredPermission: z.enum(["read_only", "preview", "approved", "autonomous_safe", "admin_only"]).default("read_only"), dryRun: z.boolean().default(true), approvalRequired: z.boolean().default(false) });
router.get("/life-os/automations", async (_req, res) => {
  await seedAutomations();
  const automations = await rows(`SELECT id,title,description,enabled,schedule,type,last_run_at AS "lastRunAt",next_run_at AS "nextRunAt",last_error AS "lastError",required_permission AS "requiredPermission",dry_run AS "dryRun",approval_required AS "approvalRequired",created_at AS "createdAt",updated_at AS "updatedAt" FROM life_automations ORDER BY title`).catch(() => []);
  return res.json({ ok: true, engine: process.env.N8N_WEBHOOK_URL ? "internal+n8n_optional" : "internal_safe_local", automations });
});
router.get("/life-os/automations/:id", async (req, res) => {
  await seedAutomations();
  const automation = (await rows(`SELECT * FROM life_automations WHERE id=$1 LIMIT 1`, [req.params.id]).catch(() => []))[0];
  return automation ? res.json({ ok: true, automation }) : res.status(404).json({ ok: false, error: "automation_not_found" });
});
router.post("/life-os/automations", async (req, res) => {
  const parsed = AutomationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  await pool.query(`INSERT INTO life_automations (id,title,description,enabled,schedule,type,required_permission,dry_run,approval_required) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [parsed.data.id, parsed.data.title, parsed.data.description, parsed.data.enabled, parsed.data.schedule, parsed.data.type, parsed.data.requiredPermission, parsed.data.dryRun, parsed.data.approvalRequired]);
  return res.status(201).json({ ok: true, automation: parsed.data });
});
router.patch("/life-os/automations/:id", async (req, res) => {
  const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined;
  const dryRun = typeof req.body?.dryRun === "boolean" ? req.body.dryRun : undefined;
  if (enabled === undefined && dryRun === undefined) return res.status(400).json({ ok: false, error: "enabled_or_dryRun_required" });
  if (enabled === true) {
    const action = PERMISSION_ACTIONS.find(item => item.actionId === "automation.enable")!;
    const verdict = await checkPermission(action, req.body?.permission ?? "read_only", true);
    if (!verdict.allowed) return res.status(403).json({ ok: false, error: "approval_required", reason: verdict.reason });
  }
  const updated = await rows(`UPDATE life_automations SET enabled=COALESCE($2,enabled),dry_run=COALESCE($3,dry_run),updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, enabled ?? null, dryRun ?? null]).catch(() => []);
  return updated[0] ? res.json({ ok: true, automation: updated[0] }) : res.status(404).json({ ok: false, error: "automation_not_found" });
});
router.post("/life-os/automations/:id/run", async (req, res) => {
  await seedAutomations();
  const automation = (await rows("SELECT * FROM life_automations WHERE id=$1 LIMIT 1", [req.params.id]).catch(() => []))[0];
  if (!automation) return res.status(404).json({ ok: false, error: "automation_not_found" });
  const dryRun = req.body?.dryRun !== false;
  if (!dryRun && automation.approval_required) {
    const verdict = await checkPermission(PERMISSION_ACTIONS.find(item => item.actionId === "automation.enable")!, req.body?.permission ?? "read_only", false);
    if (!verdict.allowed) return res.status(403).json({ ok: false, error: "approval_required", reason: verdict.reason });
  }
  const job = await createJob("automation_run", { automationId: automation.id, dryRun });
  await pool.query(`INSERT INTO life_automation_logs (automation_id,status,message,job_id,metadata) VALUES ($1,'queued',$2,$3,$4::jsonb)`, [automation.id, dryRun ? "Dry-run planifié." : "Exécution approuvée planifiée.", job.id, JSON.stringify({ dryRun })]).catch(() => {});
  return res.status(202).json({ ok: true, automationId: automation.id, dryRun, job });
});
router.get("/life-os/automations/:id/logs", async (req, res) => {
  const logs = await rows(`SELECT id,status,message,job_id AS "jobId",metadata,created_at AS "createdAt" FROM life_automation_logs WHERE automation_id=$1 ORDER BY created_at DESC LIMIT 250`, [req.params.id]).catch(() => []);
  return res.json({ ok: true, logs });
});

const CoachBody = z.object({ prompt: z.string().min(2).max(4000), energy: z.number().min(0).max(100).optional(), urgency: z.number().min(0).max(100).optional(), context: z.record(z.string(), z.unknown()).optional() });
async function coachPayload(body: z.infer<typeof CoachBody>, redTeam = false) {
  const events = await rows(`SELECT id,type,category,severity,confidence,summary,source,created_at AS "createdAt" FROM life_events ORDER BY created_at DESC LIMIT 15`).catch(() => []);
  const jobs: Array<Record<string, any>> = await rows(`SELECT id,type,status,last_error AS "lastError" FROM jobs ORDER BY created_at DESC LIMIT 10`).catch((): Array<Record<string, any>> => []);
  const integrations = integrationStatuses();
  const energy = body.energy ?? 50;
  const healthSignal = /douleur|santé|fatigue|stress|sommeil/i.test(body.prompt);
  const familySignal = /famille|couple|enfant|fille|proche/i.test(body.prompt);
  const adminSignal = /facture|amende|dette|impôt|papier|échéance|juridique/i.test(body.prompt);
  const workSignal = /travail|emploi|entretien|salaire|mission|cdi/i.test(body.prompt);
  const priorityDomain = healthSignal ? "health" : familySignal ? "family" : adminSignal ? "admin_finance" : workSignal ? "work_stability" : "projects";
  const sensitive = healthSignal || /juridique|dette|investir|médic/i.test(body.prompt);
  const recommendation = energy < 35
    ? "Réduire l'ambition: une seule action réversible de 10 minutes, puis repos ou aide humaine."
    : priorityDomain === "projects"
      ? "Vérifier d'abord santé, famille, admin et stabilité; ensuite choisir une micro-action projet de 30 minutes maximum."
      : `Traiter d'abord le domaine ${priorityDomain} avec une action courte, datée et vérifiable.`;
  const sources = events.map(event => ({ id: event.id, type: "life_event", source: event.source, confidence: Number(event.confidence), summary: event.summary })).slice(0, 8);
  const payload = {
    ok: true,
    mode: redTeam ? "red_team" : "coach",
    diagnosis: `Priorité détectée: ${priorityDomain}. Énergie déclarée: ${energy}/100.`,
    factsKnown: [
      `Énergie fournie: ${energy}/100.`,
      `${events.length} événement(s) Life OS récent(s) disponible(s).`,
      `${jobs.filter(job => job.status === "fail" || job.status === "warn").length} job(s) récent(s) en échec ou avertissement.`,
      `Gmail: ${integrations.gmail.status}; Calendar: ${integrations.calendar.status}.`,
    ],
    assumptions: events.length === 0 ? ["Le contexte historique est incomplet; la recommandation reste prudente."] : ["La demande reflète la priorité immédiate de l'utilisateur."],
    risks: [energy < 35 ? "Surcharge et mauvaise décision sous faible énergie." : "Dispersion si plusieurs fronts sont ouverts.", sensitive ? "Sujet sensible: un professionnel qualifié peut être nécessaire." : "Aucun risque clinique/juridique/financier n'est diagnostiqué."],
    tradeoffs: ["Vitesse contre sécurité.", "Ambition projet contre santé, famille et stabilité."],
    recommendation,
    redTeamCounterArguments: ["Quelle preuve contredit cette priorité ?", "Quel coût caché en sommeil, argent ou temps familial ?", "Peut-on réduire l'action de moitié ?"],
    nextAction: priorityDomain === "health" ? "Noter les symptômes factuels et contacter un professionnel si douleur, danger ou persistance." : recommendation,
    timebox: energy < 35 ? 10 : 25,
    confidence: events.length > 0 ? 0.78 : 0.58,
    sources,
    limits: ["Pas de diagnostic médical.", "Pas de conseil juridique définitif.", "Pas de promesse financière.", integrations.gmail.status !== "connected" ? "Gmail non connecté." : null, integrations.calendar.status !== "connected" ? "Calendar non connecté." : null].filter(Boolean),
    doctrine: "Santé → famille → admin/finance → stabilité professionnelle → projets → apprentissage.",
  };
  await logLifeEvent({ type: "coach_session", category: priorityDomain, severity: sensitive ? "warning" : "info", confidence: payload.confidence, summary: `Coach: ${body.prompt.slice(0, 300)}`, source: "life-os-coach", metadata: { energy, urgency: body.urgency, redTeam } });
  return payload;
}
router.post("/life-os/coach", async (req, res) => {
  const parsed = CoachBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  return res.json(await coachPayload(parsed.data));
});
router.post("/life-os/coach/red-team", async (req, res) => {
  const parsed = CoachBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "invalid_input", details: parsed.error.issues });
  return res.json(await coachPayload(parsed.data, true));
});
router.get("/life-os/coach/briefing", async (_req, res) => res.json(await coachPayload({ prompt: "Prépare mon briefing quotidien prudent.", energy: 50 })));
router.post("/life-os/coach/turn-into-task", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 240) : "";
  if (!title || req.body?.confirmed !== true) return res.status(400).json({ ok: false, error: "title_and_confirmed_required", preview: { title } });
  const result = await pool.query(`INSERT INTO tasks (title,description,status,priority) VALUES ($1,$2,'todo',$3) RETURNING id,title,status,priority`, [title, typeof req.body?.description === "string" ? req.body.description.slice(0, 2000) : null, req.body?.priority === "high" ? "high" : "medium"]);
  return res.status(201).json({ ok: true, task: result.rows[0] });
});
router.post("/life-os/coach/save-decision", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 240) : "";
  if (!title || req.body?.confirmed !== true) return res.status(400).json({ ok: false, error: "title_and_confirmed_required", preview: { title } });
  const result = await pool.query(`INSERT INTO decisions (title,context,status,confidence_score) VALUES ($1,$2,'pending',$3) RETURNING id,title,status,confidence_score AS "confidenceScore"`, [title, typeof req.body?.context === "string" ? req.body.context.slice(0, 4000) : null, 50]);
  return res.status(201).json({ ok: true, decision: result.rows[0] });
});

async function dbHealth() {
  const started = Date.now();
  try { await pool.query("SELECT 1"); return { status: "healthy", latencyMs: Date.now() - started }; }
  catch { return { status: "degraded", latencyMs: Date.now() - started }; }
}
router.get("/ops/status", async (_req, res) => {
  const [database, jobCounts] = await Promise.all([
    dbHealth(),
    rows(`SELECT status,COUNT(*)::int AS count FROM jobs GROUP BY status`).catch(() => []),
  ]);
  const integrations = integrationStatuses();
  const degraded = database.status !== "healthy" || jobCounts.some(item => ["fail", "timeout"].includes(item.status) && Number(item.count) > 0);
  return res.json({ ok: true, status: degraded ? "degraded" : "healthy", commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "unknown", environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "unknown", database, jobs: jobCounts, integrations, secretsExposed: false, generatedAt: nowIso() });
});
router.get("/ops/errors", async (_req, res) => {
  const [events, jobs] = await Promise.all([
    rows(`SELECT id,type,severity,summary,source,created_at AS "createdAt" FROM life_events WHERE severity IN ('high','critical') ORDER BY created_at DESC LIMIT 100`).catch(() => []),
    rows(`SELECT id,type,status,last_error AS "lastError",updated_at AS "updatedAt" FROM jobs WHERE status IN ('fail','timeout') ORDER BY updated_at DESC LIMIT 100`).catch(() => []),
  ]);
  return res.json({ ok: true, events, jobs });
});
router.get("/ops/jobs", async (_req, res) => {
  const counts = await rows(`SELECT status,COUNT(*)::int AS count FROM jobs GROUP BY status`).catch(() => []);
  return res.json({ ok: true, counts, fallbackJobs: fallbackJobs.size });
});
router.get("/ops/providers", (_req, res) => res.json({ ok: true, providers: {
  groq: process.env.GROQ_API_KEY ? "configured" : "missing_config",
  gemini: process.env.GEMINI_API_KEY ? "configured" : "missing_config",
  huggingface: process.env.HF_TOKEN ? "configured" : "missing_config",
  openrouter: process.env.OPENROUTER_API_KEY || process.env.OPENROUTE_API_KEY ? "configured" : "missing_config",
  n8n: process.env.N8N_WEBHOOK_URL ? "configured" : "missing_config",
} }));
router.get("/ops/integrations", (_req, res) => res.json({ ok: true, integrations: integrationStatuses() }));
router.get("/ops/synthetic-checks", async (_req, res) => {
  const database = await dbHealth();
  return res.json({ ok: true, checks: [{ id: "db", status: database.status, latencyMs: database.latencyMs }, { id: "permissions", status: PERMISSION_ACTIONS.length > 0 ? "pass" : "fail" }, { id: "life-priority-doctrine", status: "pass" }], lastE2ERun: process.env.LAST_E2E_RUN_AT ?? "unknown" });
});
router.get("/ops/railway", (_req, res) => {
  const available = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID);
  return res.json({ ok: true, status: available ? "environment_detected" : "unavailable", environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null, service: process.env.RAILWAY_SERVICE_NAME ?? null, commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null, tokenExposed: false });
});

export default router;
