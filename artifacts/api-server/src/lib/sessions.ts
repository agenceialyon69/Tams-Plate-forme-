import crypto from "node:crypto";
import { db, sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "./logger";

const ACCESS_TOKEN_DURATION = "15m"; // Short-lived access token
const REFRESH_TOKEN_DURATION_DAYS = 30; // Refresh token valid for 30 days

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getAccessTokenDuration(): string {
  return ACCESS_TOKEN_DURATION;
}

export function parseUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown device";

  // Simple detection for common browsers/devices
  if (userAgent.includes("iPhone")) return "iPhone";
  if (userAgent.includes("iPad")) return "iPad";
  if (userAgent.includes("Android")) {
    if (userAgent.includes("Mobile")) return "Android Phone";
    return "Android Tablet";
  }
  if (userAgent.includes("Macintosh")) return "Mac";
  if (userAgent.includes("Windows")) return "Windows PC";
  if (userAgent.includes("Linux")) return "Linux";

  return "Unknown device";
}

export async function createSession(
  userId: number,
  userAgent: string | undefined,
  ipAddress: string | undefined,
  deviceName?: string
): Promise<{ accessToken: string; refreshToken: string; sessionId: number }> {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();

  const accessTokenHash = hashToken(accessToken);
  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      userId,
      sessionTokenHash: accessTokenHash,
      refreshTokenHash,
      deviceName: deviceName || parseUserAgent(userAgent),
      userAgent,
      ipAddress,
      expiresAt,
    })
    .returning();

  logger.info({
    sessionId: session.id,
    userId,
    deviceName: session.deviceName,
    ip: ipAddress
  }, "Session created");

  return { accessToken, refreshToken, sessionId: session.id };
}

export async function validateAccessToken(accessToken: string): Promise<{ userId: number; sessionId: number } | null> {
  const tokenHash = hashToken(accessToken);

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.sessionTokenHash, tokenHash),
        gt(sessionsTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) return null;

  // Update last active
  await db
    .update(sessionsTable)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessionsTable.id, session.id));

  return { userId: session.userId, sessionId: session.id };
}

export async function refreshTokens(
  refreshToken: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokenHash = hashToken(refreshToken);

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.refreshTokenHash, tokenHash))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // Generate new tokens
  const newAccessToken = generateAccessToken();
  const newRefreshToken = generateRefreshToken();

  const newAccessTokenHash = hashToken(newAccessToken);
  const newRefreshTokenHash = hashToken(newRefreshToken);

  // Rotate tokens
  await db
    .update(sessionsTable)
    .set({
      sessionTokenHash: newAccessTokenHash,
      refreshTokenHash: newRefreshTokenHash,
      lastActiveAt: new Date(),
      userAgent,
      ipAddress,
    })
    .where(eq(sessionsTable.id, session.id));

  logger.info({
    sessionId: session.id,
    userId: session.userId
  }, "Tokens refreshed");

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function revokeSession(sessionId: number, userId: number): Promise<boolean> {
  const result = await db
    .delete(sessionsTable)
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        eq(sessionsTable.userId, userId)
      )
    );

  return (result.rowCount ?? 0) > 0;
}

export async function revokeAllSessions(userId: number, exceptSessionId?: number): Promise<number> {
  const sessions = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));

  let count = 0;
  for (const s of sessions) {
    if (exceptSessionId && s.id === exceptSessionId) continue;
    await db.delete(sessionsTable).where(eq(sessionsTable.id, s.id));
    count++;
  }

  logger.info({ userId, count }, "Sessions revoked");
  return count;
}

export async function getActiveSessions(userId: number) {
  const sessions = await db
    .select({
      id: sessionsTable.id,
      deviceName: sessionsTable.deviceName,
      ipAddress: sessionsTable.ipAddress,
      lastActiveAt: sessionsTable.lastActiveAt,
      createdAt: sessionsTable.createdAt,
      expiresAt: sessionsTable.expiresAt,
    })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, userId),
        gt(sessionsTable.expiresAt, new Date())
      )
    );

  return sessions;
}

export function getSessionDurationSeconds(): number {
  // Parse ACCESS_TOKEN_DURATION for frontend
  return 15 * 60; // 15 minutes
}

export function getRefreshTokenDurationDays(): number {
  return REFRESH_TOKEN_DURATION_DAYS;
}
