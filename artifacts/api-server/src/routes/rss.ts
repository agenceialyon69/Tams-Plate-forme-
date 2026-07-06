/**
 * VEILLE RSS — free-first. Sous /api => protégé par le gate admin.
 *   POST /api/rss/read   { url }        -> { ok, feed }
 *   POST /api/rss/digest { urls: [] }   -> { ok, text, feeds }
 */
import { Router } from "express";
import { fetchFeed, fetchDigest, BlockedUrl } from "../lib/rss.js";

const router = Router();

router.post("/rss/read", async (req, res) => {
  const b = (typeof req.body === "object" && req.body) ? req.body as Record<string, unknown> : {};
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return res.status(400).json({ ok: false, error: "paramètre 'url' requis" });
  try {
    const feed = await fetchFeed(url);
    return res.json({ ok: true, feed });
  } catch (err) {
    if (err instanceof BlockedUrl) return res.status(400).json({ ok: false, code: "URL_BLOCKED", error: err.message });
    return res.status(502).json({ ok: false, error: `Lecture du flux impossible : ${err instanceof Error ? err.message : "erreur"}` });
  }
});

router.post("/rss/digest", async (req, res) => {
  const b = (typeof req.body === "object" && req.body) ? req.body as Record<string, unknown> : {};
  const urls = Array.isArray(b.urls) ? b.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0) : [];
  if (urls.length === 0) return res.status(400).json({ ok: false, error: "paramètre 'urls' (liste) requis" });
  try {
    const digest = await fetchDigest(urls);
    return res.json({ ok: true, ...digest });
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Digest impossible : ${err instanceof Error ? err.message : "erreur"}` });
  }
});

export default router;
