import { Router, type IRouter } from "express";
import { db, recordingsTable } from "@workspace/db";
import { transcribeAudio, analyzeRecording } from "../lib/ai";
import { desc, eq } from "drizzle-orm";
import { rateLimit } from "../middlewares/rate-limit";
import { checkAndIncrementAiCalls } from "./quotas";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const recordingLimiter = rateLimit({ windowMs: 60_000, max: 10 });

type MeetingType = "meeting" | "call" | "brainstorm" | "voice";
const VALID_MEETING_TYPES: MeetingType[] = ["meeting", "call", "brainstorm", "voice"];

function isMeetingType(v: unknown): v is MeetingType {
  return typeof v === "string" && (VALID_MEETING_TYPES as string[]).includes(v);
}

function asStr(v: unknown, max = 500): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, max);
}

/** Shared quota guard — call before any LLM invocation. Fail-closed. */
async function checkQuota(
  req: import("express").Request,
  res: import("express").Response,
): Promise<boolean> {
  const tenantId = req.tenantId;
  if (!tenantId) return true; // legacy / no-tenant mode: allow
  const guard = await checkAndIncrementAiCalls(tenantId, {
    userId: req.authUser?.id,
    route: req.path,
  });
  if (!guard.allowed) {
    res.status(429).json({
      error: "Quota IA dépassé.",
      detail: guard.reason,
      code: "AI_QUOTA_EXCEEDED",
    });
    return false;
  }
  return true;
}

/** POST /api/recordings/analyze — transcribe audio + Red Team analysis */
router.post("/recordings/analyze", recordingLimiter, async (req, res): Promise<void> => {
  const { audioBase64, mimeType, title, context, meetingType, durationSeconds } = req.body ?? {};

  const safeTitle = asStr(title, 500);
  if (!safeTitle) { res.status(400).json({ error: "title requis" }); return; }
  if (!audioBase64 || typeof audioBase64 !== "string") {
    res.status(400).json({ error: "audioBase64 requis" }); return;
  }

  // ~75MB base64 limit (≈55MB audio ≈ 45 min @ 96kbps webm/opus)
  if (audioBase64.length > 100_000_000) {
    res.status(413).json({ error: "Audio trop volumineux. Maximum ~45 minutes." }); return;
  }

  // ── Cost guardrail — transcribe (Groq) + analysis (Gemini) = 2 AI calls ──
  // We gate on 1 call; recording analysis is expensive, so it counts once.
  if (!await checkQuota(req, res)) return;
  // ─────────────────────────────────────────────────────────────────────────

  const safeMimeType = typeof mimeType === "string" ? mimeType : "audio/webm";
  const safeMeetingType: MeetingType = isMeetingType(meetingType) ? meetingType : "meeting";
  const safeContext = asStr(context, 2000);
  const safeDuration = typeof durationSeconds === "number" && durationSeconds >= 0 ? Math.floor(durationSeconds) : null;

  try {
    const transcript = await transcribeAudio(audioBase64, safeMimeType);
    const analysis = await analyzeRecording(transcript, safeTitle, safeMeetingType, safeContext);

    const [saved] = await db.insert(recordingsTable).values({
      title: safeTitle,
      context: safeContext,
      meetingType: safeMeetingType,
      durationSeconds: safeDuration,
      transcript,
      summary: analysis.summary,
      actionItems: JSON.stringify(analysis.actionItems),
      commitments: JSON.stringify(analysis.commitments),
      decisions: JSON.stringify(analysis.decisions),
      blindSpots: analysis.blindSpots,
      redTeamCritique: analysis.redTeamCritique,
      tamsMessage: analysis.tamsMessage,
    }).returning();

    res.json({ ...saved, actionItems: analysis.actionItems, commitments: analysis.commitments, decisions: analysis.decisions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

/** POST /api/recordings/analyze-text — analyze typed/pasted transcript (no audio) */
router.post("/recordings/analyze-text", recordingLimiter, async (req, res): Promise<void> => {
  const { transcript, title, context, meetingType, durationSeconds } = req.body ?? {};

  const safeTitle = asStr(title, 500);
  const safeTranscript = asStr(transcript, 60_000);
  if (!safeTitle || !safeTranscript) {
    res.status(400).json({ error: "title et transcript requis" }); return;
  }

  // ── Cost guardrail ──────────────────────────────────────────────────────────
  if (!await checkQuota(req, res)) return;
  // ───────────────────────────────────────────────────────────────────────────

  const safeMeetingType: MeetingType = isMeetingType(meetingType) ? meetingType : "meeting";
  const safeContext = asStr(context, 2000);
  const safeDuration = typeof durationSeconds === "number" && durationSeconds >= 0 ? Math.floor(durationSeconds) : null;

  try {
    const analysis = await analyzeRecording(safeTranscript, safeTitle, safeMeetingType, safeContext);

    const [saved] = await db.insert(recordingsTable).values({
      title: safeTitle,
      context: safeContext,
      meetingType: safeMeetingType,
      durationSeconds: safeDuration,
      transcript: safeTranscript,
      summary: analysis.summary,
      actionItems: JSON.stringify(analysis.actionItems),
      commitments: JSON.stringify(analysis.commitments),
      decisions: JSON.stringify(analysis.decisions),
      blindSpots: analysis.blindSpots,
      redTeamCritique: analysis.redTeamCritique,
      tamsMessage: analysis.tamsMessage,
    }).returning();

    res.json({ ...saved, actionItems: analysis.actionItems, commitments: analysis.commitments, decisions: analysis.decisions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

/** GET /api/recordings — list recordings, newest first */
router.get("/recordings", async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: recordingsTable.id,
    title: recordingsTable.title,
    meetingType: recordingsTable.meetingType,
    durationSeconds: recordingsTable.durationSeconds,
    tamsMessage: recordingsTable.tamsMessage,
    createdAt: recordingsTable.createdAt,
  }).from(recordingsTable).orderBy(desc(recordingsTable.createdAt)).limit(50);
  res.json(rows);
});

/** GET /api/recordings/:id — full recording with parsed arrays */
router.get("/recordings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(recordingsTable).where(eq(recordingsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  let actionItems = [], commitments = [], decisions = [];
  try { actionItems = JSON.parse(row.actionItems ?? "[]"); } catch {}
  try { commitments = JSON.parse(row.commitments ?? "[]"); } catch {}
  try { decisions = JSON.parse(row.decisions ?? "[]"); } catch {}

  res.json({ ...row, actionItems, commitments, decisions });
});

/** DELETE /api/recordings/:id */
router.delete("/recordings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(recordingsTable).where(eq(recordingsTable.id, id));
  res.status(204).end();
});

export default router;
