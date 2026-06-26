import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { logger } from "./logger";

export async function logActivity(type: string, title: string, description: string, entityId: number): Promise<void> {
  try {
    await db.insert(activityTable).values({ type: type as any, title, description, entityId });
  } catch (err) {
    logger.warn({ err, type, title }, "Failed to log activity");
  }
}
