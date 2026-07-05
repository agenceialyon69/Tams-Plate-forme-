/**
 * MON AGENT — Code Operator (LECTURE SEULE). Routes de compréhension de repo.
 *
 * Sous /api → protégées par le gate admin quand il est actif. GITHUB_TOKEN
 * absent => 503 missing_config (jamais de faux contenu). Aucune écriture ici.
 */
import { Router } from "express";
import { readFile, listTree, searchCode, MissingGithubConfig } from "../lib/github-code-operator.js";

const router = Router();

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function handleError(res: import("express").Response, err: unknown): void {
  if (err instanceof MissingGithubConfig) {
    res.status(503).json({ ok: false, code: "GITHUB_NOT_CONFIGURED", error: "Opérateur de code non connecté : définir GITHUB_TOKEN côté serveur." });
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const status = /requis|requise|invalide|dossier|pas un fichier/i.test(msg) ? 400 : 502;
  res.status(status).json({ ok: false, error: msg });
}

// GET /api/code/file?repo=owner/name&path=chemin&ref=branche
router.get("/code/file", async (req, res) => {
  try {
    const path = str(req.query.path);
    if (!path) return res.status(400).json({ ok: false, error: "paramètre 'path' requis" });
    const file = await readFile({ repo: str(req.query.repo) || undefined, path, ref: str(req.query.ref) || undefined });
    return res.json({ ok: true, file });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/code/tree?repo=owner/name&ref=branche&limit=2000
router.get("/code/tree", async (req, res) => {
  try {
    const tree = await listTree({ repo: str(req.query.repo) || undefined, ref: str(req.query.ref) || undefined, limit: Number(req.query.limit) || undefined });
    return res.json({ ok: true, ...tree });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/code/search?repo=owner/name&q=terme&limit=10
router.get("/code/search", async (req, res) => {
  try {
    const q = str(req.query.q);
    if (!q) return res.status(400).json({ ok: false, error: "paramètre 'q' requis" });
    const result = await searchCode({ repo: str(req.query.repo) || undefined, query: q, limit: Number(req.query.limit) || undefined });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
