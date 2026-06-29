import { Router } from "express";
import { db, assetsTable } from "@workspace/db";

const router = Router();

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
