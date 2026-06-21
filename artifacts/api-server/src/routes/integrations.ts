import { Router, type IRouter } from "express";
import { requireRole } from "../middlewares/auth-jwt";
import {
  isGithubConfigured,
  githubViewer,
  listRepos,
  listIssues,
  createIssue,
} from "../lib/integrations/github";
import { ffmpegStatus } from "../lib/integrations/ffmpeg";

const router: IRouter = Router();

/**
 * External integrations (modular, feature-flagged). Each integration only
 * activates when its credentials are present; otherwise the status endpoint
 * reports it as disabled and the data endpoints return 503. All routes are
 * restricted to owner/admin — these touch the owner's external accounts.
 */

// --- GitHub ----------------------------------------------------------------

/** GET /api/integrations/github/status — configured? + viewer identity. */
router.get(
  "/integrations/github/status",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    if (!isGithubConfigured()) {
      res.json({ configured: false });
      return;
    }
    try {
      const viewer = await githubViewer();
      res.json({ configured: true, viewer });
    } catch {
      // Token present but invalid/expired — surface clearly, don't leak it.
      res.json({ configured: true, valid: false, error: "Token GitHub invalide ou expiré." });
    }
  }
);

function ensureGithub(res: import("express").Response): boolean {
  if (!isGithubConfigured()) {
    res.status(503).json({ error: "Intégration GitHub non configurée (GITHUB_TOKEN manquant)." });
    return false;
  }
  return true;
}

/** GET /api/integrations/github/repos — accessible repositories. */
router.get(
  "/integrations/github/repos",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!ensureGithub(res)) return;
    try {
      const limit = Number(req.query.limit) || 20;
      res.json({ repos: await listRepos(limit) });
    } catch (err) {
      res.status(502).json({ error: "Impossible de récupérer les dépôts.", detail: String(err).slice(0, 200) });
    }
  }
);

/** GET /api/integrations/github/repos/:owner/:repo/issues — open issues/PRs. */
router.get(
  "/integrations/github/repos/:owner/:repo/issues",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!ensureGithub(res)) return;
    try {
      const limit = Number(req.query.limit) || 20;
      const issues = await listIssues(String(req.params.owner), String(req.params.repo), limit);
      res.json({ issues });
    } catch (err) {
      res.status(502).json({ error: "Impossible de récupérer les issues.", detail: String(err).slice(0, 200) });
    }
  }
);

/** POST /api/integrations/github/repos/:owner/:repo/issues — create an issue. */
router.post(
  "/integrations/github/repos/:owner/:repo/issues",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!ensureGithub(res)) return;
    const body = (req.body ?? {}) as { title?: unknown; body?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "Titre requis." });
      return;
    }
    try {
      const created = await createIssue(
        String(req.params.owner),
        String(req.params.repo),
        title,
        typeof body.body === "string" ? body.body : undefined
      );
      res.status(201).json(created);
    } catch (err) {
      res.status(502).json({ error: "Création de l'issue impossible.", detail: String(err).slice(0, 200) });
    }
  }
);

// --- FFmpeg (video/audio toolkit — free, local, no account) ----------------

/** GET /api/integrations/ffmpeg/status — is ffmpeg available? + version. */
router.get(
  "/integrations/ffmpeg/status",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    const status = await ffmpegStatus();
    res.json({ configured: status.available, version: status.version });
  }
);

export default router;
