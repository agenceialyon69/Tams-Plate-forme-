import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { aiConfigured } from "../lib/ai";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/detailed", async (_req, res) => {
  try {
    const checks: Record<string, { status: "ok" | "error"; message?: string }> = {};

    // DB check
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "ok", message: "Connected" };
    } catch (err: any) {
      checks.database = { status: "error", message: err?.message ?? "DB unreachable" };
    }

    // AI check
    try {
      const configured = aiConfigured();
      checks.ai = configured
        ? { status: "ok", message: "Configured" }
        : { status: "error", message: "No provider configured" };
    } catch (err: any) {
      checks.ai = { status: "error", message: err?.message ?? "AI check failed" };
    }

    // Disk check (Node.js — utilisation du répertoire courant)
    try {
      const fs = await import("node:fs");
      const stats = fs.statSync(".");
      checks.disk = { status: "ok", message: "Accessible" };
    } catch (err: any) {
      checks.disk = { status: "error", message: err?.message ?? "Disk check failed" };
    }

    // Memory check
    const mem = process.memoryUsage();
    const memoryOk = mem.heapUsed < mem.heapTotal * 0.9;
    checks.memory = memoryOk
      ? { status: "ok", message: `Heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB` }
      : { status: "error", message: `Heap critical: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB` };

    const allOk = Object.values(checks).every(c => c.status === "ok");

    res.json({
      status: allOk ? "ok" : "degraded",
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? "0.0.0",
      checks,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: "Health check failed" });
  }
});

export default router;
