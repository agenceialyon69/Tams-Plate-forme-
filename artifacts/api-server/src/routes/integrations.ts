import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { db, assetsTable } from "@workspace/db";
import { executeTool } from "../lib/agent-tools.js";

const router = Router();

/**
 * CAPTURE TELEGRAM / GOOGLE SHEET — canal free-first prioritaire.
 *
 * L'utilisateur a DÉJÀ un bot Telegram relié à sa Google Sheet via un workflow
 * n8n (voir docs/n8n-console-setup.md). On NE le remplace pas : on ajoute un
 * point d'entrée pour que ce workflow envoie une capture (note / idée / tâche)
 * à TAMS, qui la range en tâche ou en mémoire. Le Sheet reste le journal.
 *
 * Sécurité : endpoint machine-à-machine (n8n → TAMS), protégé par un SECRET
 * partagé (TAMS_TELEGRAM_CAPTURE_SECRET), comparé en temps constant. Non
 * configuré = 503 honnête (canal "non connecté", jamais présenté comme actif).
 * Ce endpoint ne fait QUE stocker : il n'exécute jamais d'action sensible
 * (email, calendrier…). Toute action reste à confirmer ensuite via Mon Agent.
 *
 * Body : { text: string, kind?: "task"|"note"|"idea"|"auto", source?: string,
 *          secret?: string }  (secret aussi accepté via header x-tams-capture-secret)
 */
function captureSecret(): string {
  return (process.env.TAMS_TELEGRAM_CAPTURE_SECRET || "").trim();
}

function timingEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

router.post("/integrations/telegram-capture", async (req, res) => {
  const secret = captureSecret();
  if (!secret) {
    return res.status(503).json({
      ok: false,
      code: "CAPTURE_NOT_CONFIGURED",
      error: "Capture Telegram/Sheet non connectée. Définir TAMS_TELEGRAM_CAPTURE_SECRET côté serveur, puis pointer le workflow n8n vers ce endpoint.",
    });
  }

  const headerSecret = req.headers["x-tams-capture-secret"];
  const provided = (typeof headerSecret === "string" ? headerSecret : typeof req.body?.secret === "string" ? req.body.secret : "").trim();
  if (!provided || !timingEqual(provided, secret)) {
    req.log?.warn?.({ path: "/integrations/telegram-capture" }, "capture: secret invalide");
    return res.status(401).json({ ok: false, error: "Secret de capture invalide" });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ ok: false, error: "Champ 'text' requis" });
  }

  const source = typeof req.body?.source === "string" ? req.body.source.slice(0, 60) : "telegram";
  const rawKind = typeof req.body?.kind === "string" ? req.body.kind.toLowerCase() : "auto";
  const looksTask = /^\/?(t[âa]che|todo|rappelle?|rappel)\b/i.test(text) || /\b(rappelle-moi|à faire|a faire)\b/i.test(text);
  const kind = rawKind === "task" || rawKind === "note" || rawKind === "idea" ? rawKind : looksTask ? "task" : "note";

  // executeTool NE throw PAS : il renvoie { __type:"error", message } en cas
  // d'échec. On ne déclare donc "ok" QUE si un vrai enregistrement (id) existe.
  try {
    if (kind === "task") {
      const title = text.replace(/^\/?(t[âa]che|todo|rappelle?-moi|rappelle?|rappel)\s*:?\s*/i, "").trim() || text;
      const out = JSON.parse(await executeTool("create_task", { title: title.slice(0, 200), description: `Capturé via ${source}` }));
      if (out?.__type === "error" || out?.id == null) {
        return res.status(502).json({ ok: false, error: "Stockage TAMS indisponible (base de données ?)", detail: out?.message ?? "création de tâche échouée" });
      }
      return res.json({ ok: true, stored: { type: "task", id: out.id, title: out.title }, source });
    }
    const memType = kind === "idea" ? "goal" : "note";
    const out = JSON.parse(await executeTool("create_memory", { title: text.slice(0, 120), content: text, type: memType, tags: ["telegram", "capture", source] }));
    if (out?.__type === "error" || out?.id == null) {
      return res.status(502).json({ ok: false, error: "Stockage TAMS indisponible (base de données ?)", detail: out?.message ?? "création de mémoire échouée" });
    }
    return res.json({ ok: true, stored: { type: "memory", id: out.id, title: out.title, memoryType: out.type }, source });
  } catch (err) {
    req.log?.error?.({ err }, "capture: stockage échoué");
    return res.status(502).json({ ok: false, error: "Stockage TAMS indisponible (base de données ?)", detail: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Connecteur SHOPIFY — import des produits de la boutique dans TAMS (Assets).
 * 100 % gratuit : appel direct à l'Admin API Shopify côté serveur (pas d'OAuth
 * complexe — l'utilisateur fournit un jeton d'app privée / custom app
 * `shpat_...`). Les images produits deviennent des assets exploitables (Studio,
 * future génération vidéo). Aucune dépendance payante.
 *
 * Body : { shop: "ma-boutique.myshopify.com", token: "shpat_...", limit?: number }
 */
router.post("/integrations/shopify/import", async (req, res) => {
  try {
    let { shop, token } = req.body as { shop?: string; token?: string };
    const { limit } = req.body as { limit?: number };

    if (!shop || !token) {
      return res.status(400).json({ error: "shop (xxx.myshopify.com) et token (shpat_...) requis" });
    }

    // Normalise le domaine : retire protocole / chemin éventuels.
    shop = shop.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({ error: "Domaine invalide. Format attendu : ma-boutique.myshopify.com" });
    }

    const max = Math.min(Number(limit) || 50, 250);
    const url = `https://${shop}/admin/api/2024-01/products.json?limit=${max}`;

    const r = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      const hint = r.status === 401 || r.status === 403
        ? "Jeton invalide ou scopes insuffisants (active read_products sur ton app privée Shopify)."
        : undefined;
      return res.status(502).json({ error: `Shopify a répondu ${r.status}`, hint, detail });
    }

    const data = (await r.json()) as { products?: ShopifyProduct[] };
    const products = data.products ?? [];

    let imported = 0;
    for (const p of products) {
      const image = p.image?.src ?? p.images?.[0]?.src ?? null;
      const description = p.body_html ? p.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000) : null;
      await db.insert(assetsTable).values({
        name: String(p.title ?? "Produit Shopify").slice(0, 200),
        type: "image",
        url: image,
        content: description,
        tags: ["shopify", ...(p.product_type ? [String(p.product_type)] : [])],
      });
      imported++;
    }

    return res.json({
      ok: true,
      imported,
      total: products.length,
      shop,
      samples: products.slice(0, 3).map((p) => ({ title: p.title, image: p.image?.src ?? null })),
    });
  } catch (err) {
    req.log?.error?.({ err }, "Shopify import failed");
    return res.status(500).json({ error: "Import Shopify échoué", detail: err instanceof Error ? err.message : String(err) });
  }
});

interface ShopifyProduct {
  title?: string;
  body_html?: string;
  product_type?: string;
  image?: { src?: string } | null;
  images?: Array<{ src?: string }>;
}

export default router;
