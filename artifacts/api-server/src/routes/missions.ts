/**
 * ROUTE MISSIONS — pilote l'organisation autonome de TAMS.
 *
 * Endpoints :
 * - GET    /api/missions          — liste toutes les missions
 * - POST   /api/missions          — crée une nouvelle mission
 * - GET    /api/missions/:id      — détails d'une mission
 * - POST   /api/missions/:id/cancel  — annule une mission
 * - POST   /api/missions/:id/approve — approuve une porte humaine
 * - GET    /api/missions/runtime  — statut du runtime
 * - POST   /api/missions/runtime/start  — démarre le runtime
 * - POST   /api/missions/runtime/stop   — arrête le runtime
 * - GET    /api/missions/tools    — catalogue d'outils
 * - GET    /api/missions/tools/log — journal des appels d'outils
 */

import { Router } from "express";
import { z } from "zod";
import {
  createMission,
  getMission,
  listMissions,
  cancelMission,
  approveHumanGate,
  startRuntime,
  stopRuntime,
  isRuntimeRunning,
  getRuntimeStatus,
} from "../lib/agents/runtime";
import { getToolCatalog, getToolCallLog, getToolNamesForAgent } from "../lib/agents/tool-orchestrator";
import { getAllAgents } from "../lib/agents/definitions";
import { logActivity } from "../lib/activity";

const router = Router();

// ─── Runtime ──────────────────────────────────────────────────────────────────

router.get("/missions/runtime", (_req, res) => {
  res.json(getRuntimeStatus());
});

router.post("/missions/runtime/start", (_req, res) => {
  startRuntime();
  res.json({ running: true, message: "Runtime démarré" });
});

router.post("/missions/runtime/stop", (_req, res) => {
  stopRuntime();
  res.json({ running: false, message: "Runtime arrêté" });
});

// ─── Missions ──────────────────────────────────────────────────────────────────

const CreateMissionBody = z.object({
  objective: z.string().min(3, "objectif requis (min 3 caractères)"),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

router.get("/missions", (_req, res) => {
  res.json({ data: listMissions() });
});

router.post("/missions", async (req, res) => {
  try {
    const parsed = CreateMissionBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const id = createMission(parsed.data.objective, parsed.data.priority || "medium");
    await logActivity("agent", "Mission créée", parsed.data.objective.slice(0, 80), 0);

    // Démarre le runtime si pas déjà en cours
    if (!isRuntimeRunning()) {
      startRuntime();
    }

    return res.json({ data: { id, status: "pending", message: "Mission créée et enfile" } });
  } catch (err) {
    req.log.error({ err }, "Error creating mission");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/missions/:id", (req, res) => {
  const mission = getMission(req.params.id);
  if (!mission) return res.status(404).json({ error: "Mission introuvable" });
  return res.json({ data: mission });
});

router.post("/missions/:id/cancel", (req, res) => {
  const ok = cancelMission(req.params.id);
  if (!ok) return res.status(404).json({ error: "Mission introuvable" });
  return res.json({ data: { cancelled: true } });
});

const ApproveBody = z.object({
  gate: z.string().min(1, "gate requis"),
});

router.post("/missions/:id/approve", (req, res) => {
  try {
    const parsed = ApproveBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const ok = approveHumanGate(req.params.id, parsed.data.gate);
    if (!ok) return res.status(404).json({ error: "Mission ou porte introuvable" });
    return res.json({ data: { approved: true } });
  } catch (err) {
    req.log.error({ err }, "Error approving gate");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Tools ─────────────────────────────────────────────────────────────────────

router.get("/missions/tools", (_req, res) => {
  res.json({ data: getToolCatalog() });
});

router.get("/missions/tools/log", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json({ data: getToolCallLog(limit) });
});

router.get("/missions/tools/:role", (req, res) => {
  const tools = getToolNamesForAgent(req.params.role as any);
  res.json({ data: tools });
});

// ─── Agents catalogue ──────────────────────────────────────────────────────────

router.get("/missions/agents", (_req, res) => {
  const agents = getAllAgents().map(a => ({
    role: a.role,
    name: a.name,
    description: a.description,
    capabilities: a.capabilities,
    permissionLevel: a.permissionLevel,
    validationCriteria: a.validationCriteria,
    tools: a.tools.map(t => t.name),
  }));
  res.json({ data: agents });
});

export default router;
