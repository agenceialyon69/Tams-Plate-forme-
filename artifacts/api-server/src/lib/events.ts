import type { Request } from "express";
import { db, appEventsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Structured application event tracking.
 *
 * One small surface (`trackEvent`) + typed helpers so call sites never
 * duplicate the event shape. Fire-and-forget: it must never throw or block a
 * request — failures are logged, not propagated.
 *
 * Distinct from `audit_logs` (automatic HTTP write log via auditMiddleware):
 * these are meaningful product/analytics events.
 */

export type EventSource = "front" | "backend" | "copilot" | "jobs";
export type EventSeverity = "info" | "warning" | "critical";

export interface TrackEventParams {
  userId?: number | null;
  tenantId?: number | null;
  /** Reserved for a future workspace/tenant split. */
  workspaceId?: number | null;
  event: string;
  category: string;
  source?: EventSource;
  severity?: EventSeverity;
  metadata?: Record<string, unknown> | null;
  req?: Pick<Request, "ip" | "socket">;
}

function ipFrom(req?: Pick<Request, "ip" | "socket">): string | null {
  if (!req) return null;
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/** Record a structured app event. Fire-and-forget; never throws. */
export function trackEvent(params: TrackEventParams): void {
  db.insert(appEventsTable)
    .values({
      userId: params.userId ?? null,
      tenantId: params.tenantId ?? null,
      workspaceId: params.workspaceId ?? null,
      event: params.event.slice(0, 120),
      category: params.category.slice(0, 60),
      source: params.source ?? "backend",
      severity: params.severity ?? "info",
      metadata: params.metadata ?? null,
      ip: ipFrom(params.req),
    })
    .catch((err) => logger.error({ err, event: params.event }, "trackEvent failed"));
}

// --- Typed helpers ----------------------------------------------------------

/** A Red Team / security audit run completed. */
export function trackAuditRun(params: {
  userId?: number | null;
  tenantId?: number | null;
  testsRun: number;
  failures: number;
  durationMs: number;
  req?: Pick<Request, "ip" | "socket">;
}): void {
  trackEvent({
    userId: params.userId,
    tenantId: params.tenantId,
    event: "audit_run",
    category: "audit",
    source: "backend",
    severity: params.failures > 0 ? "warning" : "info",
    metadata: {
      testsRun: params.testsRun,
      failures: params.failures,
      durationMs: params.durationMs,
    },
    req: params.req,
  });
}

/** A Copilot conversation turn was answered. */
export function trackCopilotMessage(params: {
  userId?: number | null;
  tenantId?: number | null;
  productId?: string | null;
  webSearch?: boolean;
  req?: Pick<Request, "ip" | "socket">;
}): void {
  trackEvent({
    userId: params.userId,
    tenantId: params.tenantId,
    event: "copilot_message",
    category: "copilot",
    source: "copilot",
    metadata: { productId: params.productId ?? "tams", webSearch: Boolean(params.webSearch) },
    req: params.req,
  });
}

/** A media asset (image or video) was generated. */
export function trackMediaGenerated(params: {
  userId?: number | null;
  tenantId?: number | null;
  kind: "image" | "video";
  provider?: string;
  req?: Pick<Request, "ip" | "socket">;
}): void {
  trackEvent({
    userId: params.userId,
    tenantId: params.tenantId,
    event: `${params.kind}_generated`,
    category: "media",
    source: "backend",
    metadata: { kind: params.kind, provider: params.provider ?? null },
    req: params.req,
  });
}
