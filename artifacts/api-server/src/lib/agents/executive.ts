import { aiChat } from "../ai";
import { generateMusic } from "../audio";
import { generateSlideshowVideo } from "../video";
import { db, assetsTable, memoriesTable } from "@workspace/db";
import { logActivity } from "../activity";

/**
 * AI EXECUTIVE — le directeur général de TAMS.
 * Reçoit une MISSION utilisateur (depuis le Chat) et orchestre AUTOMATIQUEMENT
 * les Factories (LLM, Music, Image, Video) de bout en bout, puis mémorise et
 * livre le résultat dans le Chat. L'utilisateur exprime un objectif — l'Executive
 * s'occupe du reste. 100% via le routeur IA gratuit + outils gratuits.
 *
 * Renvoie une string : un marqueur média (AUDIO:/VIDEO:/IMAGE:url) rendu dans le
 * Chat, ou un message. La mission est tracée (memory + asset + activity).
 */

type MissionKind = "music" | "video" | "image" | "generic";

function classify(goal: string): MissionKind {
  const g = goal.toLowerCase();
  if (/\b(clip|vid[ée]o|video|tiktok|reel|short|montage|film)\b/.test(g)) return "video";
  if (/\b(musique|music|son|chanson|beat|drill|rap|instru|track|m[ée]lodie|prod)\b/.test(g)) return "music";
  if (/\b(image|visuel|photo|affiche|poster|logo|illustration|cover)\b/.test(g)) return "image";
  return "generic";
}

async function llm(system: string, user: string, maxTokens = 500): Promise<string> {
  try {
    const c = await aiChat({ messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens }, "chat");
    return c?.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

function pollImage(prompt: string, seed: number, w = 720, h = 1280): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;
}

async function memorize(kind: string, title: string, url: string | null, assetType: "audio" | "video" | "image", content: string): Promise<void> {
  try {
    if (url) await db.insert(assetsTable).values({ name: title.slice(0, 200), type: assetType, url, tags: ["executive", kind] });
    await db.insert(memoriesTable).values({ title: `Mission ${kind}: ${title}`.slice(0, 200), type: "project", content: content.slice(0, 1000), tags: ["mission", kind] });
    await logActivity("ai_call", "AI Executive", `Mission ${kind} livrée: ${title.slice(0, 50)}`, 0);
  } catch {
    /* best-effort : la mémoire n'interrompt jamais la livraison */
  }
}

export async function executeMission(goal: string): Promise<string> {
  const kind = classify(goal);

  // ── Mission MUSIQUE : concept/paroles → musique (MusicGen) → cover → mémoire ──
  if (kind === "music") {
    const concept = await llm(
      "Tu es directeur musical. À partir de la demande, écris un BREF concept (genre, ambiance, tempo) puis 4 lignes de paroles accrocheuses. Français, concis.",
      goal, 350,
    );
    const music = await generateMusic(goal);
    const coverUrl = pollImage(`album cover art, ${goal}, modern, striking, high quality`, Math.floor(Math.random() * 1e6), 1024, 1024);
    await memorize("music", goal, music.ok ? music.url! : coverUrl, music.ok ? "audio" : "image", `${concept}\nCover: ${coverUrl}`);
    if (music.ok && music.url) return `AUDIO:${music.url}`;
    // Audio indisponible (ex: HF_TOKEN absent) → on livre au moins la cover + le concept.
    return `IMAGE:${coverUrl}`;
  }

  // ── Mission VIDÉO/CLIP : storyboard → images → vidéo 9:16 (FFmpeg) → mémoire ──
  if (kind === "video") {
    const sb = await llm(
      'Tu es directeur vidéo TikTok. Donne 3 à 4 descriptions d\'images VERTICALES (anglais, accrocheuses, cohérentes) + un texte court à incruster. Réponds UNIQUEMENT en JSON: {"scenes":["...","..."],"text":"..."}.',
      goal, 450,
    );
    let scenes: string[] = [];
    let text = "";
    try {
      const p = JSON.parse(sb) as { scenes?: string[]; text?: string };
      if (Array.isArray(p.scenes)) scenes = p.scenes.filter((s) => typeof s === "string").slice(0, 4);
      if (typeof p.text === "string") text = p.text;
    } catch {
      /* fallback ci-dessous */
    }
    if (scenes.length === 0) scenes = [goal, `${goal}, close-up`, `${goal}, dynamic angle, cinematic`];
    const images = scenes.map((s, i) => pollImage(s, Math.floor(Math.random() * 1e6) + i));
    try {
      const result = await generateSlideshowVideo({ images, text: text || undefined, secondsPerImage: 2.5 });
      await memorize("video", goal, result.url, "video", `Storyboard: ${scenes.join(" | ")}\nTexte: ${text}`);
      return `VIDEO:${result.url}`;
    } catch (err) {
      return `La vidéo a échoué (${err instanceof Error ? err.message : "erreur"}). Storyboard prêt: ${scenes.join(" · ")}`;
    }
  }

  // ── Mission IMAGE ──
  if (kind === "image") {
    const url = pollImage(goal, Math.floor(Math.random() * 1e6), 1024, 1024);
    await memorize("image", goal, url, "image", goal);
    return `IMAGE:${url}`;
  }

  // ── Générique : guide vers une production concrète ──
  return `Je suis l'AI Executive. Je peux produire automatiquement : 🎵 musique, 🎬 clip vidéo TikTok, 🖼️ image. Dis par exemple « crée une musique drill » ou « crée un clip TikTok de baskets sur fond blanc ».`;
}
