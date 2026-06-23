import { db, energyLogsTable } from "@workspace/db";
import { gte } from "drizzle-orm";

const dayStr = (d: Date): string => d.toISOString().split("T")[0];

/**
 * Real activity signal: number of consecutive calendar days — ending today (or
 * yesterday if today has no entry yet) — that have at least one energy log.
 *
 * Derived from actual data (no hardcoded/placeholder value), so the dashboard
 * shows a truthful "streak" that helps the user decide rather than mislead.
 */
export async function getConsecutiveActiveDays(): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const rows = await db
    .select({ d: energyLogsTable.logDate })
    .from(energyLogsTable)
    .where(gte(energyLogsTable.logDate, dayStr(since)));

  const days = new Set(rows.map((r) => r.d));
  if (days.size === 0) return 0;

  const cursor = new Date();
  // If today is not logged yet, let the streak end yesterday.
  if (!days.has(dayStr(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(dayStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
