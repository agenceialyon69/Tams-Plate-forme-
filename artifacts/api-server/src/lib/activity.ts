import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { logger } from "./logger";

type ActivityType = "task" | "project" | "contact" | "memory" | "decision" | "conversation" | "asset" | "agent";

/**
 * Enregistre une action dans le journal d'activité.
 * Silencieux en cas d'échec (jamais une raison de planter une requête).
 */
export async function logActivity(
  type: ActivityType,
  title: string,
  description: string,
  entityId: number,
): Promise<void> {
  try {
    await db.insert(activityTable).values({ type: type as any, title, description, entityId });
  } catch (err) {
    logger.warn({ err, type, title }, "Failed to log activity");
  }
}
