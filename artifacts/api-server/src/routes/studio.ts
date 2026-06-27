/**
 * Studio Route
 * Creative content generation: documents, scripts, presentations, audio scripts
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import { aiChat, aiConfigured } from "../lib/ai";

const router = Router();

// ─── Document Generation ───────────────────────────────────────────────────

interface DocumentRequest {
  type: "report" | "proposal" | "presentation" | "memo" | "article" | "email";
  title?: string;
  context: string;
  tone?: "formal" | "professional" | "casual" | "persuasive";
  length?: "brief" | "medium" | "detailed";
}

router.post("/studio/generate-document", async (req, res) => {
  try {
    const { type, title, context, tone = "professional", length = "medium" } = req.body as DocumentRequest;

    if (!type || !context) {
      return res.status(400).json({ error: "type and context are required" });
    }

    const typePrompts: Record<string, string> = {
      report: `Tu génères un RAPPORT PROFESSIONNEL structuré avec:
1. Résumé exécutif (2-3 phrases)
2. Objectifs du rapport
3. Analyse détaillée (3-4 sections avec sous-titres)
4. Conclusions et recommandations
5. Points d'action

Format: Markdown avec titres et listes.`,
      proposal: `Tu génères une PROPOSITION COMMERCIALE structurée avec:
1. Résumé de l'opportunité
2. Besoins identifiés
3. Solution proposée (3-4 points clés)
4. Bénéfices attendus
5. Étapes suivantes et appel à l'action

Format: Markdown professionnel.`,
      presentation: `Tu génères un SCRIPT DE PRÉSENTATION avec:
1. Slide 1: Titre et accroche
2. Slides 2-8: Contenu structuré (une idée par slide)
3. Slide finale: Résumé et appel à l'action

Format: Chaque slide = titre + points clés + notes du présentateur.`,
      memo: `Tu génères un MÉMO EXÉCUTIF concis avec:
1. Objet (1 ligne)
2. Contexte (2-3 phrases)
3. Points clés (3-5 bullet points)
4. Décision ou action requise

Format: Structuré et direct.`,
      article: `Tu génères un ARTICLE BLOG/Web avec:
1. Titre accrocheur
2. Introduction captivante (le "hook")
3. Corps structuré (3-5 sections)
4. Conclusion avec takeaways
5. Call-to-action

Format: Markdown SEO-friendly.`,
      email: `Tu génères un EMAIL professionnel avec:
1. Objet clair
2. Salutation appropriée
3. Corps structuré (contexte + demande)
4. Formule de politesse

Format: Prêt à envoyer.`,
    };

    const lengthGuidance = {
      brief: "Réponse concise: 200-300 mots maximum.",
      medium: "Réponse détaillée: 400-600 mots.",
      detailed: "Réponse complète: 800-1000 mots.",
    };

    const systemPrompt = `${typePrompts[type]}

Ton: ${tone === "formal" ? "Formel et précis" : tone === "casual" ? "Décontracté mais professionnel" : tone === "persuasive" ? "Persuasif et engageant" : "Professionnel et clair"}

${lengthGuidance[length]}

IMPORTANT: Génère UNIQUEMENT le contenu du document, sans métadonnées.`;

    if (!aiConfigured()) {
      const fallbackContent = generateFallbackDocument(type, title || "Sans titre", context);
      return res.json({
        content: fallbackContent,
        type,
        title: title || "Document généré",
      });
    }

    const completion = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Titre: ${title || "À déterminer"}\n\nContexte/Sujet:\n${context}` },
      ],
      max_tokens: length === "detailed" ? 2000 : 1000,
    });

    const content = completion.choices?.[0]?.message?.content || "";

    // Save as asset
    if (title) {
      const [asset] = await db.insert(assetsTable).values({
        name: title,
        type: "document",
        content,
        mimeType: "text/markdown",
      }).returning();
      if (asset) {
        await logActivity("asset", title, `Document ${type} généré`, asset.id);
      }
    }

    return res.json({
      content,
      type,
      title: title || "Document généré",
    });
  } catch (err) {
    req.log.error({ err }, "Error generating document");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Media Script Generation ──────────────────────────────────────────────────

router.post("/studio/generate-script", async (req, res) => {
  try {
    const { mediaType, prompt } = req.body as { mediaType: "video" | "audio" | "podcast"; prompt: string };

    if (!mediaType || !prompt) {
      return res.status(400).json({ error: "mediaType and prompt are required" });
    }

    const systemPrompt = mediaType === "video"
      ? `Tu es un expert en production vidéo. Génère un script structuré avec:
1. Synopsis (1-2 phrases)
2. Structure temporelle (intro, développement, conclusion avec timestamps)
3. Notes de production (visuels suggérés, musique, ambiance)

Format JSON: { "script": "texte complet", "scenes": [...], "suggestions": ["titre1", "titre2", "titre3"], "duration": "X min" }`
      : mediaType === "podcast"
      ? `Tu es un expert en podcasting. Génère un outline d'épisode avec:
1. Introduction et accroche
2. Segments thématiques (3-5 points)
3. Questions de transition
4. Conclusion et appel à l'action

Format JSON: { "script": "outline complet", "segments": [...], "suggestions": ["titre1", "titre2", "titre3"], "duration": "X min" }`
      : `Tu es un expert en production audio. Génère un brief musical complet avec:
1. Ambiance et mood
2. Structure suggérée
3. Instruments et style
4. Paroles ou narration si applicable

Format JSON: { "script": "brief complet", "elements": [...], "suggestions": ["titre1", "titre2", "titre3"] }`;

    if (!aiConfigured()) {
      const fallback = generateFallbackScript(mediaType, prompt);
      return res.json(fallback);
    }

    const completion = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }, "json");

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { script?: string; suggestions?: string[] };

    return res.json({
      script: parsed.script ?? "",
      suggestions: parsed.suggestions ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Error generating media script");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Prompt Engineering ───────────────────────────────────────────────────────

router.post("/studio/optimize-prompt", async (req, res) => {
  try {
    const { prompt, targetModel } = req.body as { prompt: string; targetModel?: string };

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const systemPrompt = `Tu es un expert en prompt engineering. Améliore le prompt fourni pour:
1. Clarifier l'objectif
2. Ajouter du contexte pertinent
3. Spécifier le format de sortie attendu
4. Éliminer les ambiguïtés

${targetModel ? `Optimise pour le modèle: ${targetModel}` : "Optimise pour un usage général."}

Format JSON: { "optimized": "prompt amélioré", "improvements": ["changement 1", "changement 2"], "suggestions": ["tip 1", "tip 2"] }`;

    const completion = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }, "json");

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Error optimizing prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Image Generation (réelle & gratuite) ──────────────────────────────────────
// Moteur : Pollinations (Flux) — déterministe par URL, sans clé API, 100 % gratuit
// (Pilier 7). Enrichissement optionnel du prompt via le routeur IA gratuit.
// Retourne toujours une URL → jamais de bouton "Créer" qui échoue en silence.
router.post("/studio/generate-image", async (req, res) => {
  try {
    const { prompt, width, height } = req.body as {
      prompt?: string; width?: number; height?: number;
    };
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const w = Math.min(Math.max(Number(width) || 1024, 256), 1536);
    const h = Math.min(Math.max(Number(height) || 1024, 256), 1536);

    let finalPrompt = prompt.trim();
    let enhanced = false;

    if (aiConfigured()) {
      try {
        const completion = await aiChat({
          messages: [
            { role: "system", content: "Tu transformes une idée brève en un prompt de génération d'image en ANGLAIS, riche et précis (sujet, style, éclairage, composition, qualité). Réponds UNIQUEMENT par le prompt, sans guillemets ni préambule." },
            { role: "user", content: finalPrompt },
          ],
          max_tokens: 200,
        }, "fast");
        const out = completion.choices?.[0]?.message?.content?.trim();
        if (out) { finalPrompt = out; enhanced = true; }
      } catch {
        /* best-effort : on garde le prompt brut */
      }
    }

    const seed = Math.floor(Math.random() * 1_000_000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;

    return res.json({ url, prompt: finalPrompt, enhanced, engine: "pollinations" });
  } catch (err) {
    req.log.error({ err }, "Error generating image");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/studio/image-generation/status", (_req, res) => {
  res.json({
    available: true,
    engine: "pollinations",
    free: true,
    note: "Génération d'image gratuite via Pollinations/Flux (sans clé). ComfyUI/SD optionnels en self-host.",
    endpoints: {
      comfyui: process.env.COMFYUI_URL || "http://localhost:8188",
      automatic1111: process.env.AUTOMATIC1111_URL || "http://localhost:7860",
    },
  });
});

// ─── Audio Transcription Status ───────────────────────────────────────────────

router.get("/studio/transcription/status", (_req, res) => {
  res.json({
    available: false,
    reason: "Whisper non configuré localement",
    models: ["tiny", "base", "small", "medium", "large"],
    recommended: "base",
  });
});

// ─── Export Document ─────────────────────────────────────────────────────────

router.post("/studio/export", (req, res) => {
  try {
    const { content, format = "markdown", title = "document" } = req.body as {
      content: string;
      format?: "markdown" | "html" | "txt";
      title?: string;
    };

    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    // For now, return the content as-is
    // In production, this would convert to PDF/DOCX using a library
    const mimeType = format === "html" ? "text/html" : format === "txt" ? "text/plain" : "text/markdown";
    const filename = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.${format === "html" ? "html" : format === "txt" ? "txt" : "md"}`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    req.log.error({ err }, "Error exporting document");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Fallback Generators ───────────────────────────────────────────────────────

function generateFallbackDocument(type: string, title: string, context: string): string {
  const templates: Record<string, string> = {
    report: `# ${title}

## Résumé Exécutif
${context}

## Contexte
_À compléter avec les détails spécifiques._

## Objectifs
- Objectif principal identifié
- Objectifs secondaires

## Analyse
### Point 1
_Détail à développer_

### Point 2
_Détail à développer_

## Conclusions et Recommandations
_Actionable insights basés sur l'analyse._

## Prochaines Étapes
1. Action immédiate
2. Court terme
3. Moyen terme`,

    proposal: `# ${title}

## Contexte de l'Opportunité
${context}

## Besoins Identifiés
- Besoin 1
- Besoin 2
- Besoin 3

## Notre Solution
### Approche
_Description de la méthodologie_

### Livrables
- Livrable 1
- Livrable 2

## Bénéfices Attendus
- Gain de temps
- Réduction des coûts
- Amélioration de la qualité

## Prochaines Étapes
_Contacter [nom] pour une réunion de cadrage._`,

    presentation: `# ${title}

---

## Slide 1: Titre
**${title}**

_Notes: Accroche sur l'importance du sujet_

---

## Slide 2: Contexte
${context}

_Notes: Expliquer pourquoi ce sujet est important_

---

## Slide 3: Points Clés
- Point 1
- Point 2
- Point 3

_Notes: Un message par slide_

---

## Slide 4: Détails
_Contenu à personnaliser selon le contexte_

---

## Slide 5: Conclusion
**Messages à retenir**

_Appel à l'action_

---`,

    memo: `**MÉMO EXÉCUTIF**

**Objet:** ${title}

**Contexte:**
${context}

**Points Clés:**
- Point 1
- Point 2
- Point 3

**Action Requise:**
_Décision ou validation demandée._

---`,

    article: `# ${title}

${context}

## Introduction
_Article à développer avec des exemples concrets._

## Section 1
_Contenu principal_

## Section 2
_Approfondissement_

## Conclusion
_Key takeaways_

---
*Article publié sur [plateforme]*`,

    email: `Objet: ${title}

Bonjour,

${context}

Je reste à votre disposition pour tout complément d'information.

Cordialement,

---
Mohamed`,
  };

  return templates[type] || templates.report;
}

function generateFallbackScript(mediaType: string, prompt: string): { script: string; suggestions: string[] } {
  return {
    script: mediaType === "video"
      ? `SCRIPT VIDÉO: ${prompt}

[INTRO - 0:00 à 0:10]
Plan d'ouverture dynamique.
Narration: "Dans cette vidéo, nous allons explorer..."

[DÉVELOPPEMENT - 0:10 à 0:45]
Scènes clés avec transitions.
Visuels: plans moyens et gros plans.

[CONCLUSION - 0:45 à 1:00]
Résumé et appel à l'action.
"Abonnez-vous pour plus de contenu..."`

      : mediaType === "podcast"
      ? `OUTLINE PODCAST: ${prompt}

[INTRO] (2 min)
- Présentation du sujet
- Accroche et contexte

[SEGMENT 1] (8 min)
- Premier angle d'approche
- Exemples concrets

[SEGMENT 2] (8 min)
- Approfondissement
- Questions clés

[CONCLUSION] (2 min)
- Résumé des points
- Appel à l'action`

      : `BRIEF AUDIO: ${prompt}

Genre: Ambient / Corporate
Tempo: 90-110 BPM
Durée: 2-3 minutes

Instruments:
- Synthétiseurs pads
- Piano
- Percussions légères

Ambiance: Professionnelle, inspirante`,
    suggestions: ["Version standard", "Version premium", "Version minimaliste"],
  };
}

export default router;
