import { Router, type RequestHandler } from "express";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ChatEngineeringController,
  runtimeEnabled,
  type EngineeringTask,
  type ChatEngineeringRequest,
} from "@workspace/scripts/dev-runtime-chat";
import { requireAuth } from "../middlewares/auth";

const router = Router();
const tasks = new Map<string, EngineeringTask>();
const controller = new ChatEngineeringController(process.cwd());

// Unsafe actions are ALWAYS disabled regardless of other flags.
// This is a hardcoded safety invariant — not overridable by env.
const UNSAFE_ACTIONS_ENABLED = false as const;

const requireRuntimeEnabled: RequestHandler = (_req, res, next): void => {
  if (!runtimeEnabled()) {
    res.status(503).json({
      error: "Runtime désactivé",
      message: "TAMS Development Runtime est désactivé par sécurité.",
      hint: "Configurer TAMS_DEV_RUNTIME_ENABLED=true uniquement dans un environnement de développement sécurisé.",
    });
    return;
  }
  next();
};

const requireNoUnsafeActions: RequestHandler = (_req, res, next): void => {
  if (UNSAFE_ACTIONS_ENABLED) {
    // This branch can never be reached (const false), but the check is
    // explicit so a future code change requiring a real flag is obvious.
    res.status(403).json({ error: "Actions dangereuses désactivées" });
    return;
  }
  next();
};

/**
 * Chat runtime entry point.
 *
 * Safety invariants enforced here:
 * - requireAuth: valid Supabase Bearer token required
 * - requireRuntimeEnabled: TAMS_DEV_RUNTIME_ENABLED=true required
 * - requireNoUnsafeActions: ENABLE_UNSAFE_RUNTIME_ACTIONS always false
 * - ChatEngineeringController.handle(): isDangerousObjective() blocks destructive requests
 * - Mode defaults to read_only unless explicitly elevated by strategy
 */
router.post(
  "/conversations/:id/runtime",
  requireAuth,
  requireRuntimeEnabled,
  requireNoUnsafeActions,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: "Conversation invalide" });
    }

    const [conversation] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable" });

    const body = req.body as Omit<ChatEngineeringRequest, "actorId">;
    if (!body?.objective?.trim()) return res.status(400).json({ error: "objective requis" });

    try {
      // The conversations schema has no user ownership column yet.
      // Fail closed: the public chat bridge is read-only until ownership exists.
      const task = await controller.handle({
        ...body,
        mode: "read_only",
        actorId: req.user!.id,
      });
      tasks.set(task.id, task);

      const reportText = [
        `## TAMS Development Runtime \u2014 ${task.report.verdict}`,
        `Task: ${task.id}`,
        `Strat\u00e9gie: ${task.strategy}`,
        `Mode: ${task.mode}`,
        task.report.summary,
        task.diff ? `\n### Diff\n\`\`\`diff\n${task.diff.slice(0, 12_000)}\n\`\`\`` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      await db.insert(messagesTable).values([
        { conversationId, role: "user", content: body.objective },
        { conversationId, role: "assistant", content: reportText },
      ]);

      return res.status(task.report.verdict === "REFUSED" ? 403 : 200).json(task);
    } catch (error) {
      req.log?.error?.({ error }, "Development runtime chat task failed");
      return res.status(500).json({
        error: "\u00c9chec du Development Runtime",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

router.get(
  "/conversations/:id/runtime/:taskId",
  requireAuth,
  requireRuntimeEnabled,
  (req, res) => {
    const task = tasks.get(String(req.params.taskId));
    if (!task) return res.status(404).json({ error: "Task runtime introuvable" });
    if (task.actorId !== req.user!.id) return res.status(403).json({ error: "Acc\u00e8s refus\u00e9" });
    return res.json(task);
  },
);

/**
 * Public status endpoint: tells the Chat OS whether the runtime bridge is
 * available, without exposing internals. Safe to call without auth.
 */
router.get("/conversations/runtime/status", (_req, res) => {
  res.json({
    runtimeEnabled: runtimeEnabled(),
    unsafeActionsEnabled: UNSAFE_ACTIONS_ENABLED,
    message: runtimeEnabled()
      ? "Runtime actif. Authentification requise pour utiliser."
      : "Runtime install\u00e9 mais d\u00e9sactiv\u00e9 par s\u00e9curit\u00e9.",
  });
});

export default router;
