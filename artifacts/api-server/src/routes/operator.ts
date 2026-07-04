/**
 * MON AGENT — routes operator (control plane du chat).
 * Voir lib/operator.ts pour la logique. Ces routes sont protégées comme tout
 * /api par le gate global (REQUIRE_AUTH) — aucun contournement ici.
 */
import { Router } from "express";
import {
  handleOperatorChat,
  operatorCapabilities,
  operatorReadiness,
  confirmAction,
  cancelAction,
  getAction,
} from "../lib/operator.js";
import { ciOperatorStatus } from "../lib/dev-agent-ci-operator.js";

const router = Router();

function bodyOf(req: { body?: unknown }): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
}

// Statut global de Mon Agent (lecture seule).
router.get("/operator/status", async (_req, res) => {
  try {
    const caps = operatorCapabilities();
    res.json({
      ok: true,
      agent: "TAMS Personal Operator",
      mode: "personal_free_first",
      capabilitiesActive: caps.filter(c => c.status === "available" || c.status === "configured").length,
      capabilitiesTotal: caps.length,
      ciOperator: ciOperatorStatus(),
      authGate: process.env.REQUIRE_AUTH === "true" ? "require_auth" : process.env.TAMS_PERSONAL_ACCESS_ENABLED === "true" ? "personal_gate" : "open",
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Capacités (id, label, status, freeFirst, riskLevel, requiresConfirmation, toolsUsed, fallback, nextSetupStep).
router.get("/operator/capabilities", (_req, res) => {
  try {
    res.json({ ok: true, capabilities: operatorCapabilities(), generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Readiness PASS/WARN/FAIL avec cause/risque/prochaine action.
router.get("/operator/readiness", async (_req, res) => {
  try {
    res.json(await operatorReadiness());
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Point d'entrée principal : le chat comme control plane.
// Body: { message: string, params?: Record<string, unknown> }
router.post("/operator/chat", async (req, res) => {
  try {
    const b = bodyOf(req);
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (!message) return res.status(400).json({ ok: false, error: "message requis" });
    const params = typeof b.params === "object" && b.params !== null ? b.params as Record<string, unknown> : {};
    const result = await handleOperatorChat(message, params);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Confirme une action sensible en attente (dispatch CI / rerun / création de PR).
router.post("/operator/confirm", async (req, res) => {
  try {
    const id = typeof bodyOf(req).confirmationId === "string" ? String(bodyOf(req).confirmationId) : "";
    if (!id) return res.status(400).json({ ok: false, error: "confirmationId requis" });
    const action = await confirmAction(id);
    if (!action) return res.status(404).json({ ok: false, error: "confirmation inconnue ou expirée" });
    return res.json({ ok: action.status === "completed", action });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Annule une action en attente.
router.post("/operator/cancel", (req, res) => {
  const id = typeof bodyOf(req).confirmationId === "string" ? String(bodyOf(req).confirmationId) : "";
  if (!id) return res.status(400).json({ ok: false, error: "confirmationId requis" });
  const action = cancelAction(id);
  if (!action) return res.status(404).json({ ok: false, error: "confirmation inconnue ou expirée" });
  return res.json({ ok: true, action });
});

// Consulte l'état d'une action (pending/running/completed/failed/cancelled/expired).
router.get("/operator/actions/:id", (req, res) => {
  const action = getAction(req.params.id);
  if (!action) return res.status(404).json({ ok: false, error: "action inconnue ou purgée" });
  return res.json({ ok: true, action });
});

export default router;
