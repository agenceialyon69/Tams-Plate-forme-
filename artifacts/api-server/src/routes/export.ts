import { Router, type IRouter } from "express";
import {
  db,
  capturesTable,
  tasksTable,
  eventsTable,
  learningsTable,
  decisionsTable,
  memoryTable,
  eveningReviewsTable,
  energyLogsTable,
  auditLogsTable,
  appEventsTable,
  copilotMessagesTable,
  usersTable,
  leadsTable,
  recordingsTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth-jwt";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream, unlinkSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";

const exec = promisify(execFile);

const router: IRouter = Router();

router.get("/export/status", requireRole("admin", "owner"), async (req, res): Promise<void> => {
  try {
    const counts = await Promise.all([
      db.select().from(capturesTable).then(r => r.length),
      db.select().from(tasksTable).then(r => r.length),
      db.select().from(eventsTable).then(r => r.length),
      db.select().from(learningsTable).then(r => r.length),
      db.select().from(decisionsTable).then(r => r.length),
      db.select().from(memoryTable).then(r => r.length),
      db.select().from(eveningReviewsTable).then(r => r.length),
      db.select().from(energyLogsTable).then(r => r.length),
      db.select().from(auditLogsTable).then(r => Math.min(r.length, 1000)),
    ]);

    res.json({
      counts: {
        captures: counts[0],
        tasks: counts[1],
        events: counts[2],
        learnings: counts[3],
        decisions: counts[4],
        memory: counts[5],
        reviews: counts[6],
        energy: counts[7],
        audit: counts[8],
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get export status" });
  }
});

router.get("/export", requireRole("admin", "owner"), async (req, res): Promise<void> => {
  try {
    const [
      captures,
      tasks,
      events,
      learnings,
      decisions,
      memory,
      reviews,
      energy,
      audit,
      appEvents,
      copilotMessages,
      leads,
      recordings,
    ] = await Promise.all([
      db.select().from(capturesTable).orderBy(desc(capturesTable.createdAt)),
      db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
      db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)),
      db.select().from(learningsTable).orderBy(desc(learningsTable.createdAt)),
      db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt)),
      db.select().from(memoryTable).orderBy(desc(memoryTable.createdAt)),
      db.select().from(eveningReviewsTable).orderBy(desc(eveningReviewsTable.createdAt)),
      db.select().from(energyLogsTable).orderBy(desc(energyLogsTable.createdAt)),
      db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(1000),
      db.select().from(appEventsTable).orderBy(desc(appEventsTable.createdAt)).limit(500),
      db.select().from(copilotMessagesTable).orderBy(desc(copilotMessagesTable.createdAt)).limit(500),
      db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)),
      db.select().from(recordingsTable).orderBy(desc(recordingsTable.createdAt)),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "2.0",
      data: {
        captures,
        tasks,
        events,
        learnings,
        decisions,
        memory,
        reviews,
        energy,
        audit,
        appEvents,
        copilotMessages,
        leads,
        recordings,
      },
      counts: {
        captures: captures.length,
        tasks: tasks.length,
        events: events.length,
        learnings: learnings.length,
        decisions: decisions.length,
        memory: memory.length,
        reviews: reviews.length,
        energy: energy.length,
        audit: audit.length,
        appEvents: appEvents.length,
        copilotMessages: copilotMessages.length,
        leads: leads.length,
        recordings: recordings.length,
      },
    };

    const filename = `tams-export-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

router.get("/export/zip", requireRole("admin", "owner"), async (req, res): Promise<void> => {
  const tmpDir = tmpdir();
  const exportId = `tams-${Date.now()}`;
  const workDir = join(tmpDir, exportId);

  try {
    mkdirSync(workDir, { recursive: true });

    const [
      captures, tasks, events, learnings, decisions, memory, reviews, energy,
      audit, appEvents, copilotMessages, leads, recordings,
    ] = await Promise.all([
      db.select().from(capturesTable).orderBy(desc(capturesTable.createdAt)),
      db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
      db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)),
      db.select().from(learningsTable).orderBy(desc(learningsTable.createdAt)),
      db.select().from(decisionsTable).orderBy(desc(decisionsTable.createdAt)),
      db.select().from(memoryTable).orderBy(desc(memoryTable.createdAt)),
      db.select().from(eveningReviewsTable).orderBy(desc(eveningReviewsTable.createdAt)),
      db.select().from(energyLogsTable).orderBy(desc(energyLogsTable.createdAt)),
      db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(1000),
      db.select().from(appEventsTable).orderBy(desc(appEventsTable.createdAt)).limit(500),
      db.select().from(copilotMessagesTable).orderBy(desc(copilotMessagesTable.createdAt)).limit(500),
      db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)),
      db.select().from(recordingsTable).orderBy(desc(recordingsTable.createdAt)),
    ]);

    const fullExport = {
      exportedAt: new Date().toISOString(),
      version: "2.0",
      tams: "recovery-package",
      data: { captures, tasks, events, learnings, decisions, memory, reviews, energy, audit, appEvents, copilotMessages, leads, recordings },
      counts: {
        captures: captures.length, tasks: tasks.length, events: events.length,
        learnings: learnings.length, decisions: decisions.length, memory: memory.length,
        reviews: reviews.length, energy: energy.length, audit: audit.length,
        appEvents: appEvents.length, copilotMessages: copilotMessages.length,
        leads: leads.length, recordings: recordings.length,
      },
    };

    writeFileSync(join(workDir, "database.json"), JSON.stringify(fullExport, null, 2));

    const manifest = {
      exportedAt: new Date().toISOString(),
      version: "2.0",
      files: ["database.json", "README.txt"],
      description: "TAMS Recovery Package - Complete data export",
    };
    writeFileSync(join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const readme = `TAMS Recovery Package
=====================

Date: ${new Date().toISOString()}
Version: 2.0

Contenu:
- database.json: Toutes les donnees (captures, taches, evenements, memoire, decisions, etc.)
- manifest.json: Metadonnees de l'export

Pour restaurer:
1. Importer database.json via l'API ou directement en base
2. Verifier les comptes dans manifest.json

Securite:
- Ce package contient des donnees sensibles
- Ne pas partager publiquement
- Stocker en lieu sur
`;
    writeFileSync(join(workDir, "README.txt"), readme);

    const zipPath = join(tmpDir, `${exportId}.zip`);

    try {
      await exec("zip", ["-r", "-j", zipPath, workDir]);
    } catch {
      await exec("powershell", ["-Command", `Compress-Archive -Path '${workDir}/*' -DestinationPath '${zipPath}'`]);
    }

    res.download(zipPath, `tams-recovery-${new Date().toISOString().split("T")[0]}.zip`, (err) => {
      if (existsSync(zipPath)) unlinkSync(zipPath);
      try { unlinkSync(join(workDir, "database.json")); } catch {}
      try { unlinkSync(join(workDir, "manifest.json")); } catch {}
      try { unlinkSync(join(workDir, "README.txt")); } catch {}
      try { if (existsSync(workDir)) { const fs = require("fs"); fs.rmdirSync(workDir); } } catch {}
    });
  } catch (err) {
    res.status(500).json({ error: "ZIP export failed" });
    try { if (existsSync(workDir)) { const fs = require("fs"); fs.rmSync(workDir, { recursive: true }); } } catch {}
  }
});

export default router;
