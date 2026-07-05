/**
 * DOCUMENTS — analyse d'un document uploadé, extraction LOCALE gratuite.
 *
 * POST /api/documents/analyze
 *   body: { filename, contentBase64 }  OU  { filename?, text }
 *   -> extrait le texte (txt/csv/md/json/docx/pdf) ; si un LLM gratuit est
 *      configuré et analyze!==false, renvoie aussi résumé/points/risques/actions.
 *
 * Honnêteté : jamais de faux texte. Sous /api => protégé par le gate admin.
 */
import { Router } from "express";
import { extractText, UnsupportedDocument, MAX_INPUT_BYTES } from "../lib/document-extract.js";

const router = Router();

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

router.post("/documents/analyze", async (req, res) => {
  try {
    const b = (typeof req.body === "object" && req.body) ? req.body as Record<string, unknown> : {};
    const filename = str(b.filename) || "document.txt";
    const rawText = str(b.text);
    const b64 = str(b.contentBase64);

    let extraction;
    if (rawText) {
      const text = rawText.slice(0, 100_000);
      extraction = { type: "text", chars: text.length, truncated: rawText.length > 100_000, text };
    } else if (b64) {
      let buf: Buffer;
      try {
        buf = Buffer.from(b64, "base64");
      } catch {
        return res.status(400).json({ ok: false, error: "contentBase64 invalide" });
      }
      if (buf.length === 0) return res.status(400).json({ ok: false, error: "document vide" });
      if (buf.length > MAX_INPUT_BYTES) return res.status(400).json({ ok: false, error: `document trop volumineux (> ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)} Mo)` });
      extraction = extractText(filename, buf);
    } else {
      return res.status(400).json({ ok: false, error: "Fournir 'contentBase64' (fichier) ou 'text'." });
    }

    // Extraction vide (ex. PDF scanné) : honnête, pas d'analyse inventée.
    if (!extraction.text || extraction.text.trim().length === 0) {
      return res.json({ ok: true, extraction: { type: extraction.type, chars: 0, truncated: false, note: extraction.note || "Aucun texte extractible." }, analysis: null });
    }

    let analysis: string | null = null;
    const wantAnalyze = b.analyze !== false;
    if (wantAnalyze) {
      const { aiConfigured, aiChat } = await import("../lib/ai.js");
      if (aiConfigured()) {
        try {
          const c = await aiChat({
            messages: [
              { role: "system", content: "Tu es analyste. À partir UNIQUEMENT du texte du document fourni, donne : 1) un résumé court, 2) les points clés, 3) les risques/pièges, 4) les actions à faire. Français, structuré. N'invente rien hors du texte." },
              { role: "user", content: `Document ${extraction.type} :\n\n${extraction.text.slice(0, 24000)}` },
            ],
            max_tokens: 900,
          }, "reasoning");
          analysis = c?.choices?.[0]?.message?.content ?? null;
        } catch {
          analysis = null;
        }
      }
    }

    return res.json({
      ok: true,
      extraction: { type: extraction.type, chars: extraction.chars, truncated: extraction.truncated, note: extraction.note, preview: extraction.text.slice(0, 2000) },
      analysis,
      analysisAvailable: analysis !== null,
    });
  } catch (err) {
    if (err instanceof UnsupportedDocument) {
      return res.status(400).json({ ok: false, code: "UNSUPPORTED_TYPE", error: err.message });
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = /vide|volumineux|invalide|non supporte/i.test(msg) ? 400 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

export default router;
