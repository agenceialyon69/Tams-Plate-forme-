import { Router } from "express";
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

function requireRuntimeEnabled(_req: unknown, res: { status(code: number): { json(body: unknown): unknown } }, next: () => void): unknown {
  if (!runtimeEnabled()) {
    return res.status(503).json({
      error: "TAMS Development Runtime désactivé",
      hint: "Configurer TAMS_DEV_RUNTIME_ENABLED=true uniquement dans un environnement de développement sécurisé.",
    });
  }
  next();
}

/**
 * Chat -> authenticated runtime -> task/tool/validation -> persisted chat report.
 * This route is deliberately separate from ordinary AI chat: no direct file or
 * command execution is possible without requireAuth and the runtime policy.
 */
router.post(
  "/conversations/:id/runtime",
  requireAuth,
  requireRuntimeEnabled,
  async (req, res) => {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: "Conversation invalide" });
    }
    const [conversation] = await db.select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable" });

    const body = req.body as Omit<ChatEngineeringRequest, "actorId">;
    if (!body?.objective?.trim()) return res.status(400).json({ error: "objective requis" });

    try {
      const task = await controller.handle({
        ...body,
        actorId: req.user!.id,
      });
      tasks.set(task.id, task);

      const reportText = [
        `## TAMS Development Runtime — ${task.report.verdict}`,
        `Task: ${task.id}`,
        `Stratégie: ${task.strategy}`,
        `Mode: ${task.mode}`,
        task.report.summary,
        task.diff ? `\n### Diff\n\`\`\`diff\n${task.diff.slice(0, 12_000)}\n\`\`\`` : "",
      ].filter(Boolean).join("\n\n");

      await db.insert(messagesTable).values([
        { conversationId, role: "user", content: body.objective },
        { conversationId, role: "assistant", content: reportText },
      ]);
      return res.status(task.report.verdict === "REFUSED" ? 403 : 200).json(task);
    } catch (error) {
      req.log?.error?.({ error }, "Development runtime chat task failed");
      return res.status(500).json({
        error: "Échec du Development Runtime",
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
    const task = tasks.get(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task runtime introuvable" });
    if (task.actorId !== req.user!.id) return res.status(403).json({ error: "Accès refusé" });
    return res.json(task);
  },
);

export default router;
