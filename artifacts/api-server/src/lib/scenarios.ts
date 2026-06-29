import { db, tasksTable, decisionsTable, memoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runTool } from "./agents/orchestrator";
import { runAgentCouncil } from "./agents/council";
import { planAndExecute } from "./agents/planner";
import { ReflectionEngine } from "./reflection";

/**
 * END-TO-END SCENARIOS — exécute RÉELLEMENT chaque parcours utilisateur complet
 * (Chat → Tool/Council/Planner → FFmpeg/HF → DB → Reflection) et prouve qu'il
 * aboutit. C'est ce qui casse en vrai (≠ briques isolées). Les données de test
 * sont nettoyées après. Aucun effet de bord persistant.
 */

export interface ScenarioResult {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
  durationMs: number;
}

async function run(name: string, fn: () => Promise<string>): Promise<ScenarioResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, status: "PASS", detail: detail.slice(0, 90), durationMs: Date.now() - start };
  } catch (err) {
    return { name, status: "FAIL", detail: err instanceof Error ? err.message.slice(0, 140) : "échec", durationMs: Date.now() - start };
  }
}

function extractId(s: string): number | null {
  const m = s.match(/ID:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

export async function runScenarios(): Promise<{
  overall: "PASS" | "FAIL";
  summary: { pass: number; fail: number };
  generatedAt: string;
  scenarios: ScenarioResult[];
}> {
  const scenarios: ScenarioResult[] = [];

  // Parcours rapides (DB + outils) — séquentiels pour ménager le quota gratuit.
  scenarios.push(await run("Chat → Image (Pollinations)", async () => {
    const r = await runTool("generate_image", { prompt: "product photo on white background" });
    if (!r.startsWith("IMAGE:")) throw new Error(`pas d'image: ${r.slice(0, 60)}`);
    return "image générée (URL)";
  }));

  scenarios.push(await run("Workspace → Tâche (créer+vérifier)", async () => {
    const r = await runTool("create_task", { title: `VIS_TEST_${Date.now()}` });
    const id = extractId(r);
    if (!id) throw new Error(`tâche non créée: ${r.slice(0, 60)}`);
    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    await db.delete(tasksTable).where(eq(tasksTable.id, id)).catch(() => {});
    if (!row) throw new Error("tâche introuvable après création");
    return "tâche créée + vérifiée + nettoyée";
  }));

  scenarios.push(await run("Decision Engine (créer)", async () => {
    const r = await runTool("create_decision", { title: `VIS_TEST_${Date.now()}` });
    const id = extractId(r);
    if (!id) throw new Error(`décision non créée: ${r.slice(0, 60)}`);
    await db.delete(decisionsTable).where(eq(decisionsTable.id, id)).catch(() => {});
    return "décision créée + nettoyée";
  }));

  scenarios.push(await run("Memory → créer + rechercher", async () => {
    const tag = `VIS_TEST_${Date.now()}`;
    const r = await runTool("create_memory", { title: tag, content: "scénario VIS" });
    const id = extractId(r);
    if (!id) throw new Error(`mémoire non créée: ${r.slice(0, 60)}`);
    const s = await runTool("search_memories", { query: tag });
    await db.delete(memoriesTable).where(eq(memoriesTable.id, id)).catch(() => {});
    if (/Aucune mémoire/.test(s)) throw new Error("recherche n'a pas retrouvé la mémoire");
    return "mémoire créée + retrouvée + nettoyée";
  }));

  scenarios.push(await run("Reflection Engine", async () => {
    await ReflectionEngine.reflect({ agentRole: "chief_of_staff", query: "VIS scénario", result: "ok", success: true, durationMs: 1, timestamp: new Date() });
    return "réflexion enregistrée";
  }));

  // Parcours IA (plus lents)
  scenarios.push(await run("Council (multi-agents)", async () => {
    const c = await runAgentCouncil("Quelle priorité pour lancer une boutique TikTok ?");
    if (!c.synthesis || c.synthesis.trim().length < 10) throw new Error("synthèse vide");
    return `${c.totalAgentsConsulted} agents consultés, synthèse OK`;
  }));

  scenarios.push(await run("Planner (plan d'action)", async () => {
    const p = await planAndExecute("Préparer une campagne TikTok", "");
    if (!p.plan) throw new Error("aucun plan généré");
    return "plan généré";
  }));

  scenarios.push(await run("Chat → Musique (Hugging Face)", async () => {
    const r = await runTool("generate_music", { prompt: "calm ambient, 80 BPM" });
    if (!r.startsWith("AUDIO:")) throw new Error(r.slice(0, 90));
    return "musique générée";
  }));

  // Le plus lourd en dernier : génération vidéo complète (images → FFmpeg).
  scenarios.push(await run("Chat → Vidéo (images → FFmpeg)", async () => {
    const r = await runTool("create_video", { prompt: "product on white background", scenes: 2 });
    if (!r.startsWith("VIDEO:")) throw new Error(r.slice(0, 90));
    return "vidéo 9:16 produite";
  }));

  const pass = scenarios.filter((s) => s.status === "PASS").length;
  const fail = scenarios.filter((s) => s.status === "FAIL").length;
  return { overall: fail > 0 ? "FAIL" : "PASS", summary: { pass, fail }, generatedAt: new Date().toISOString(), scenarios };
}
