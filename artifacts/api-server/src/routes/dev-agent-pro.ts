import { randomUUID } from "node:crypto";
import { Router } from "express";

const router = Router();
const sandboxes = new Map<string, { id: string; logs: string[] }>();
const plans = new Map<string, { id: string; commands: string[]; results: unknown[] }>();
const sessions = new Map<string, { id: string; objective: string; lessons: string[] }>();
const contexts = new Map<string, unknown>();
const allow = ["git status", "git diff", "pnpm run typecheck", "pnpm run build", "pnpm test", "pnpm run e2e"];
const plugins = ["github", "filesystem-sandbox", "shell-sandbox", "railway", "gmail-readonly", "calendar-readonly", "n8n", "browser-e2e", "database-inspector", "memory-graph"].map(id => ({ id, status: id.includes("gmail") || id.includes("calendar") || id === "railway" ? "missing_config" : id.includes("sandbox") ? "partial" : "connected" }));
const subAgents = ["Architect Agent", "Backend Agent", "Frontend Agent", "Security Red Team Agent", "Test/QA Agent", "Docs Agent", "Reviewer Agent", "Release Agent"].map(name => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name }));
const missions = Array.from({ length: 30 }, (_, i) => `mission-${i + 1}`);
function ok(command: string) { return allow.some(item => command === item || command.startsWith(`${item} `)); }
function str(v: unknown, f = "") { return typeof v === "string" && v.trim() ? v.trim() : f; }

router.get("/dev-agent/pro/status", (_req, res) => res.json({ ok: true, version: "dev_agent_pro_v5_foundation", verdict: "WARN", capabilities: { sandboxTerminal: "partial_safe_dry_run", commandExecution: "allowlisted_dry_run", repoIntelligence: "foundation", contextCompaction: "connected", subAgents: "dry_run", diffPreview: "empty_state", benchmark: "30_missions_smoke", sessionMemory: "memory_fallback", pluginRegistry: "connected", autoRepair: "controlled_dry_run", security: "permission_aware" } }));
router.post("/dev-agent/pro/sandbox", (req, res) => { const id = randomUUID(); const box = { id, logs: [`created:${str(req.body?.mission, "mission")}`] }; sandboxes.set(id, box); return res.status(201).json({ ok: true, sandbox: box }); });
router.get("/dev-agent/pro/sandbox/:id", (req, res) => res.json({ ok: true, sandbox: sandboxes.get(req.params.id) ?? null }));
router.post("/dev-agent/pro/sandbox/:id/command", (req, res) => { const command = str(req.body?.command); const allowed = ok(command); const box = sandboxes.get(req.params.id); box?.logs.push(`${allowed ? "ok" : "blocked"}:${command}`); return res.status(allowed ? 200 : 403).json({ ok: allowed, status: allowed ? "success" : "blocked", command, output: allowed ? `DRY_RUN:${command}` : "not_allowlisted" }); });
router.get("/dev-agent/pro/sandbox/:id/logs", (req, res) => res.json({ ok: true, logs: sandboxes.get(req.params.id)?.logs ?? [] }));
router.post("/dev-agent/pro/sandbox/:id/close", (req, res) => res.json({ ok: true, sandbox: sandboxes.get(req.params.id) ?? null, status: "closed" }));
router.post("/dev-agent/pro/command-plan", (req, res) => { const id = randomUUID(); const commands = Array.isArray(req.body?.commands) ? req.body.commands.map(String) : ["pnpm run typecheck"]; const plan = { id, commands, results: [] }; plans.set(id, plan); return res.status(201).json({ ok: true, plan }); });
router.get("/dev-agent/pro/command-plan/:id", (req, res) => res.json({ ok: true, plan: plans.get(req.params.id) ?? null }));
router.post("/dev-agent/pro/command-plan/:id/run", (req, res) => { const plan = plans.get(req.params.id); if (!plan) return res.status(404).json({ ok: false }); plan.results = plan.commands.map(command => ({ command, status: ok(command) ? "success" : "blocked" })); return res.json({ ok: plan.results.every((r: any) => r.status === "success"), plan }); });
router.get("/dev-agent/pro/command-plan/:id/logs", (req, res) => res.json({ ok: true, logs: plans.get(req.params.id)?.results ?? [] }));
router.post("/dev-agent/pro/repo-index/scan", (_req, res) => res.json({ ok: true, status: "indexed" }));
router.get("/dev-agent/pro/repo-index/status", (_req, res) => res.json({ ok: true, status: "indexed", mode: "foundation" }));
router.get("/dev-agent/pro/repo-index/search", (req, res) => res.json({ ok: true, query: str(req.query.q), results: ["life-os.ts", "dev-agent-core.ts", "dev-agent-ci.ts", "ci.yml"] }));
router.get("/dev-agent/pro/repo-index/routes", (_req, res) => res.json({ ok: true, routes: ["/api/dev-agent/pro/status"] }));
router.get("/dev-agent/pro/repo-index/file-context", (req, res) => res.json({ ok: true, path: str(req.query.path, "unknown"), context: { status: "preview" } }));
router.post("/dev-agent/pro/context/compact", (req, res) => { const id = str(req.body?.missionId, randomUUID()); const summary = { id, note: str(req.body?.note), compactedAt: new Date().toISOString() }; contexts.set(id, summary); return res.json({ ok: true, summary }); });
router.get("/dev-agent/pro/context/:id", (req, res) => res.json({ ok: true, context: contexts.get(req.params.id) ?? null }));
router.post("/dev-agent/pro/context/:id/append", (req, res) => { const next = { id: req.params.id, note: str(req.body?.note) }; contexts.set(req.params.id, next); return res.json({ ok: true, context: next }); });
router.get("/dev-agent/pro/context/:id/summary", (req, res) => res.json({ ok: true, summary: contexts.get(req.params.id) ?? null }));
router.get("/dev-agent/pro/subagents", (_req, res) => res.json({ ok: true, subAgents }));
router.post("/dev-agent/pro/subagents/run", (_req, res) => res.json({ ok: true, run: { id: randomUUID(), status: "completed", verdict: "WARN" } }));
router.get("/dev-agent/pro/subagents/runs/:id", (req, res) => res.json({ ok: true, run: { id: req.params.id } }));
router.get("/dev-agent/pro/subagents/runs/:id/report", (req, res) => res.json({ ok: true, report: { id: req.params.id, verdict: "WARN" } }));
router.get("/dev-agent/pro/diff", (_req, res) => res.json({ ok: true, mode: "empty_state", files: [] }));
router.get("/dev-agent/pro/diff/:id", (req, res) => res.json({ ok: true, missionId: req.params.id, files: [] }));
router.post("/dev-agent/pro/diff/:id/approve", (req, res) => res.json({ ok: true, missionId: req.params.id }));
router.post("/dev-agent/pro/diff/:id/reject", (req, res) => res.json({ ok: true, missionId: req.params.id }));
router.get("/dev-agent/pro/benchmark", (_req, res) => res.json({ ok: true, total: missions.length, verdict: "WARN", smokeSubset: missions.slice(0, 8) }));
router.get("/dev-agent/pro/sessions", (_req, res) => res.json({ ok: true, sessions: [...sessions.values()] }));
router.post("/dev-agent/pro/sessions", (req, res) => { const id = randomUUID(); const session = { id, objective: str(req.body?.objective, "mission"), lessons: [] as string[] }; sessions.set(id, session); return res.status(201).json({ ok: true, session }); });
router.get("/dev-agent/pro/sessions/lessons", (_req, res) => res.json({ ok: true, lessons: [...sessions.values()].flatMap(s => s.lessons) }));
router.get("/dev-agent/pro/sessions/:id", (req, res) => res.json({ ok: true, session: sessions.get(req.params.id) ?? null }));
router.post("/dev-agent/pro/sessions/:id/lesson", (req, res) => { const session = sessions.get(req.params.id); if (session) session.lessons.push(str(req.body?.lesson, "lesson")); return res.json({ ok: true, session }); });
router.get("/dev-agent/pro/plugins", (_req, res) => res.json({ ok: true, plugins }));
router.get("/dev-agent/pro/plugins/:id", (req, res) => res.json({ ok: true, plugin: plugins.find(p => p.id === req.params.id) ?? null }));
router.post("/dev-agent/pro/plugins/:id/check", (req, res) => res.json({ ok: true, plugin: plugins.find(p => p.id === req.params.id) ?? null, redacted: true }));
router.patch("/dev-agent/pro/plugins/:id", (req, res) => res.status(403).json({ ok: false, error: "review_required", pluginId: req.params.id }));
router.post("/dev-agent/pro/repair", (_req, res) => res.status(201).json({ ok: true, repair: { id: randomUUID(), status: "planned", mode: "controlled_dry_run" } }));
router.get("/dev-agent/pro/repair/:id", (req, res) => res.json({ ok: true, repair: { id: req.params.id, status: "planned" } }));
router.get("/dev-agent/pro/repair/:id/logs", (_req, res) => res.json({ ok: true, logs: ["bounded repair"] }));
router.post("/dev-agent/pro/repair/:id/continue", (req, res) => res.json({ ok: true, repairId: req.params.id }));
router.post("/dev-agent/pro/repair/:id/stop", (req, res) => res.json({ ok: true, repairId: req.params.id }));

export default router;
