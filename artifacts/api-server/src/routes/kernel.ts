/**
 * ROUTE KERNEL — point d'entrée unique pour l'AI Operating System.
 *
 * Toutes les requêtes passent par le Kernel. Aucune route ne peut le contourner.
 *
 * Endpoints:
 * - POST   /api/kernel          — traite une requête via le Kernel
 * - GET    /api/kernel/status   — statut du Kernel
 * - GET    /api/kernel/log      — journal du Kernel
 * - GET    /api/kernel/capabilities — liste des capacités enregistrées
 * - POST   /api/kernel/self-improve — déclenche le self-improvement
 * - GET    /api/kernel/scenarios — exécute les scénarios obligatoires
 */

import { Router } from "express";
import { z } from "zod";
import {
  kernelProcess,
  initKernel,
  getQueueStatus,
  getKernelLog,
  listCapabilities,
  selfImprove,
  type KernelRequest,
} from "../lib/kernel";
import { runScenarios } from "../lib/scenarios";
import { runValidation } from "../lib/validation";

const router = Router();

// Initialise le Kernel au premier appel
let kernelInitialized = false;
function ensureKernel(): void {
  if (!kernelInitialized) {
    initKernel();
    kernelInitialized = true;
  }
}

// ─── POST /api/kernel — point d'entrée unique ──────────────────────────────────

const KernelBody = z.object({
  message: z.string().min(1, "message requis"),
  userId: z.string().optional(),
  conversationId: z.number().optional(),
});

router.post("/kernel", async (req, res) => {
  try {
    ensureKernel();
    const parsed = KernelBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const kernelReq: KernelRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      raw: parsed.data.message,
      userId: parsed.data.userId,
      conversationId: parsed.data.conversationId,
      timestamp: new Date(),
    };

    const response = await kernelProcess(kernelReq);
    return res.json({ data: response });
  } catch (err) {
    req.log.error({ err }, "Kernel error");
    return res.status(500).json({ error: "Kernel error", detail: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/kernel/status ────────────────────────────────────────────────────

router.get("/kernel/status", (_req, res) => {
  ensureKernel();
  res.json(getQueueStatus());
});

// ─── GET /api/kernel/log ────────────────────────────────────────────────────────

router.get("/kernel/log", (req, res) => {
  ensureKernel();
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ data: getKernelLog(limit) });
});

// ─── GET /api/kernel/capabilities ───────────────────────────────────────────────

router.get("/kernel/capabilities", (_req, res) => {
  ensureKernel();
  res.json({ data: listCapabilities() });
});

// ─── POST /api/kernel/self-improve ──────────────────────────────────────────────

router.post("/kernel/self-improve", async (req, res) => {
  try {
    ensureKernel();
    const result = await selfImprove();
    return res.json({ data: result });
  } catch (err) {
    req.log.error({ err }, "Self-improve error");
    return res.status(500).json({ error: "Self-improve failed" });
  }
});

// ─── GET /api/kernel/scenarios — scénarios obligatoires ─────────────────────────

router.get("/kernel/scenarios", async (req, res) => {
  try {
    ensureKernel();

    // Scénario 1: "Continue le projet"
    const continueReq: KernelRequest = {
      id: `scenario_continue_${Date.now()}`,
      raw: "Continue le projet.",
      timestamp: new Date(),
    };
    const continueResult = await kernelProcess(continueReq);

    // Scénario 2: "Corrige le Studio"
    const fixReq: KernelRequest = {
      id: `scenario_fix_${Date.now()}`,
      raw: "Corrige le Studio.",
      timestamp: new Date(),
    };
    const fixResult = await kernelProcess(fixReq);

    // Scénarios E2E existants
    const e2e = await runScenarios();

    // Validation
    const validation = await runValidation();

    return res.json({
      data: {
        scenarios: [
          {
            name: "Continue le projet",
            status: continueResult.status,
            steps: continueResult.steps.map(s => ({ title: s.title, status: s.status, result: s.result?.slice(0, 80) })),
            validation: continueResult.validation?.overall,
            reflection: continueResult.reflection?.slice(0, 100),
            durationMs: continueResult.durationMs,
          },
          {
            name: "Corrige le Studio",
            status: fixResult.status,
            steps: fixResult.steps.map(s => ({ title: s.title, status: s.status, result: s.result?.slice(0, 80) })),
            validation: fixResult.validation?.overall,
            reflection: fixResult.reflection?.slice(0, 100),
            durationMs: fixResult.durationMs,
          },
          ...e2e.scenarios,
        ],
        e2eSummary: e2e.summary,
        validation: { overall: validation.overall, summary: validation.summary },
      },
    });
  } catch (err) {
    req.log.error({ err }, "Scenarios error");
    return res.status(500).json({ error: "Scenarios failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
