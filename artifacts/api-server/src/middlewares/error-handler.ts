import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const isProd = process.env.NODE_ENV === "production";

  logger.error({ err, method: req.method, url: req.url, status }, "Request error");

  res.status(status).json({
    error: isProd && status === 500 ? "Internal server error" : err.message,
  });
}
