import type { Request, Response, NextFunction } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function resourceFromPath(path: string): { resource: string; resourceId?: string } {
  const parts = path.replace(/^\//, "").split("/");
  const resource = parts[0] ?? "unknown";
  const resourceId = parts[1] && /^\d+$/.test(parts[1]) ? parts[1] : undefined;
  return { resource, resourceId };
}

function actionFromMethod(method: string, resource: string): string {
  switch (method) {
    case "POST": return `${resource}.create`;
    case "PATCH":
    case "PUT": return `${resource}.update`;
    case "DELETE": return `${resource}.delete`;
    default: return `${resource}.read`;
  }
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) { next(); return; }

  const originalEnd = res.end.bind(res);

  (res as unknown as { end: (...args: unknown[]) => unknown }).end = (...args: unknown[]) => {
    const { resource, resourceId } = resourceFromPath(req.path);
    const action = actionFromMethod(req.method, resource);

    db.insert(auditLogsTable).values({
      userId: req.authUser?.id ?? null,
      tenantId: req.tenantId ?? null,
      action,
      resource,
      resourceId: resourceId ?? null,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ip: req.ip ?? req.socket?.remoteAddress ?? "unknown",
      details: null,
    }).catch((err) => {
      logger.error({ err }, "Failed to write audit log");
    });

    return (originalEnd as (...args: unknown[]) => unknown)(...args);
  };

  next();
}
