/**
 * LIRE-URL — récupère + nettoie une page web (free-first, anti-SSRF).
 * Sous /api => protégé par le gate admin.
 */
import { Router } from "express";
import { readUrl, BlockedUrl } from "../lib/web-read.js";

const router = Router();

router.post("/web/read", async (req, res) => {
  const b = (typeof req.body === "object" && req.body) ? req.body as Record<string, unknown> : {};
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return res.status(400).json({ ok: false, error: "paramètre 'url' requis" });
  try {
    const page = await readUrl(url);
    return res.json({ ok: true, ...page });
  } catch (err) {
    if (err instanceof BlockedUrl) {
      return res.status(400).json({ ok: false, code: "URL_BLOCKED", error: err.message });
    }
    return res.status(502).json({ ok: false, error: `Lecture impossible : ${err instanceof Error ? err.message : "erreur réseau"}` });
  }
});

export default router;
