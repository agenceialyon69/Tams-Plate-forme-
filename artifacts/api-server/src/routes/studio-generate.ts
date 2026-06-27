import { Router } from "express";
import { aiChat, aiConfigured } from "../lib/ai";

const router = Router();

router.post("/studio/generate-script", async (req, res) => {
  try {
    const { mediaType, prompt } = req.body as { mediaType: "video" | "audio"; prompt: string };

    if (!mediaType || !prompt) {
      return res.status(400).json({ error: "mediaType and prompt are required" });
    }

    const systemPrompt = mediaType === "video"
      ? `Tu es un expert en production vidéo. À partir d'une idée brève, génère:
1. Un script vidéo structuré en JSON avec: intro, scenes (tableau d'objets avec 'timestamp', 'description', 'visuals', 'narration'), outro
2. 3 suggestions de titres
3. Des tags pertinents

Réponds UNIQUEMENT avec un JSON valide dans ce format:
{
  "script": "Script complet formaté avec sections claires",
  "suggestions": ["Titre 1", "Titre 2", "Titre 3"]
}`
      : `Tu es un expert en production musicale. À partir d'une idée, génère:
1. Un brief musical complet: genre, tempo, instruments, ambiance, structure, paroles suggérées si applicable
2. 3 suggestions de titres pour la piste
3. Des mots-clés pour la recherche

Réponds UNIQUEMENT avec un JSON valide dans ce format:
{
  "script": "Brief musical complet et structuré",
  "suggestions": ["Titre 1", "Titre 2", "Titre 3"]
}`;

    if (!aiConfigured()) {
      const fallback = mediaType === "video"
        ? {
            script: `SCRIPT VIDÉO : ${prompt}\n\n[INTRO — 0:00-0:05]\nPlan d'ouverture accrocheur sur le thème.\n\n[SCÈNE 1 — 0:05-0:20]\nPrésentation du sujet principal avec visuel fort.\nNarration : "${prompt.substring(0, 60)}..."\n\n[SCÈNE 2 — 0:20-0:45]\nDéveloppement du message central.\nVisuels : plans moyens et gros plans alternés.\n\n[CONCLUSION — 0:45-0:55]\nAppel à l'action clair et mémorable.\n\n[OUTRO — 0:55-1:00]\nLogo et coordonnées.`,
            suggestions: ["Version 1 : Direct et percutant", "Version 2 : Storytelling émotionnel", "Version 3 : Format tutoriel"],
          }
        : {
            script: `BRIEF MUSICAL : ${prompt}\n\nGenre : Électronique / Ambient\nTempo : 90-110 BPM\nTonalité : Mi mineur\n\nINSTRUMENTS :\n- Synthétiseurs chauds (pad)\n- Piano électrique\n- Basse synthétique\n- Percussions subtiles\n\nSTRUCTURE :\nIntro (16 mesures) → Couplet A (32) → Refrain (16) → Couplet B (32) → Refrain (16) → Outro (16)\n\nAMBIANCE : ${prompt}\nMood : Professionnel, moderne, inspirant`,
            suggestions: ["Ambient Focus", "Deep Work Session", "Strategic Flow"],
          };
      return res.json(fallback);
    }

    const completion = await aiChat({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { script?: string; suggestions?: string[] };

    return res.json({
      script: parsed.script ?? "Génération échouée",
      suggestions: parsed.suggestions ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Error generating media script");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
