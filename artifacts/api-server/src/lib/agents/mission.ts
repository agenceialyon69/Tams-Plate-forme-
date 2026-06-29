import { aiChat } from "../ai";

/**
 * PIPELINE DE MISSION — embodiment de l'organisation d'ingénierie autonome
 * (voir docs/constitution/AUTONOMOUS_ORG.md). Chaque étape = un rôle spécialisé
 * produisant une sortie structurée, via le routeur IA GRATUIT (lib/ai.ts).
 *
 * Honnêteté : ce pipeline RAISONNE (analyse/plan/architecture/red team/validation)
 * et produit un « dossier de mission » exécutable derrière des portes de validation
 * humaine. Il n'écrit PAS de code et ne déploie PAS lui-même (sécurité).
 */

const TAMS_CONTEXT =
  "TAMS est un AI Operating System personnel, 100% gratuit/auto-hébergeable (Constitution free-first : " +
  "AI Router multi-fournisseurs gratuits, ZÉRO dépendance payante, ZÉRO SDK propriétaire). Stack : pnpm " +
  "monorepo, React+Vite (Tailwind v4), Express+Drizzle, Postgres/Supabase (pgvector), Railway+Nixpacks. " +
  "Modules : Chat OS (pilote tout), agents (Council/Planner/Orchestrator), Studio (image Pollinations, " +
  "vidéo FFmpeg, musique/voix HuggingFace), Memory Graph, Reflection Engine, Observability. Principes : " +
  "intégration > volume, fiabilité, maintenabilité, aucun composant orphelin, Red Team obligatoire.";

async function jsonStage(system: string, user: string): Promise<Record<string, unknown> | null> {
  try {
    const c = await aiChat(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1100,
      },
      "reasoning",
    );
    const raw = c?.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface MissionReport {
  objective: string;
  analysis: { state?: string; priorities?: string[] } | null;
  plan: { steps?: { title?: string; role?: string; rationale?: string }[] } | null;
  architecture: { constraints?: string[]; objections?: string[]; approved?: boolean } | null;
  redTeam: { attacks?: string[]; unproven?: string[]; verdict?: string } | null;
  validation: { checklist?: string[]; humanGates?: string[]; readyToExecute?: boolean } | null;
  synthesis: string;
  durationMs: number;
}

export async function runMission(objective: string): Promise<MissionReport> {
  const start = Date.now();
  const ctx = `${TAMS_CONTEXT}\n\nOBJECTIF DE MISSION: ${objective}`;

  // 1) Analyse (Chief of Staff + Research)
  const analysis = await jsonStage(
    'Tu es Chief of Staff + Research de TAMS. Analyse l\'état actuel et les priorités réelles. Réponds en JSON: {"state": "synthèse de l\'état", "priorities": ["priorité 1", "..."]}.',
    ctx,
  );

  // 2) Planification (Mission Planner)
  const plan = await jsonStage(
    'Tu es Mission Planner. Décompose l\'objectif en étapes ORDONNÉES, chacune assignée à un rôle (architect, code_engineer, devops, qa, security). JSON: {"steps":[{"title":"...","role":"...","rationale":"..."}]}.',
    `${ctx}\n\nANALYSE: ${JSON.stringify(analysis)}`,
  );

  // 3) Architecture (garant de la Constitution)
  const architecture = await jsonStage(
    'Tu es Architect, garant de la Constitution free-first (zéro payant, anti-doublon, anti-dette, intégration>volume). Évalue le plan. JSON: {"constraints":["contrainte à respecter"],"objections":["objection ou doublon détecté"],"approved": true|false}.',
    `${ctx}\n\nPLAN: ${JSON.stringify(plan)}`,
  );

  // 4) Red Team (obligatoire)
  const redTeam = await jsonStage(
    'Tu es Red Team. Attaque le plan sans complaisance : bugs, régressions, sécurité, perf, UX, dette, fonctionnalités simulées. Refuse si insuffisamment prouvé. JSON: {"attacks":["..."],"unproven":["ce qui reste à prouver"],"verdict":"approuvé|à revoir|refusé"}.',
    `${ctx}\n\nPLAN: ${JSON.stringify(plan)}\nARCHITECTURE: ${JSON.stringify(architecture)}`,
  );

  // 5) Validation (QA + Security) avec portes humaines explicites
  const validation = await jsonStage(
    'Tu es QA + Security. Donne la checklist de tests RÉELS (front/back/API/mobile/stream/tool calls) et les PORTES DE VALIDATION HUMAINE obligatoires (commit, merge, déploiement). JSON: {"checklist":["test à faire"],"humanGates":["action nécessitant validation humaine"],"readyToExecute": true|false}.',
    `${ctx}\n\nPLAN: ${JSON.stringify(plan)}\nRED TEAM: ${JSON.stringify(redTeam)}`,
  );

  // 6) Synthèse décisionnelle (Chief of Staff)
  let synthesis = "";
  try {
    const c = await aiChat(
      {
        messages: [
          {
            role: "system",
            content:
              "Tu es Chief of Staff. Synthétise la mission en une décision claire et actionnable (français, concis) : quoi faire ensuite, dans quel ordre, et ce qui requiert une validation humaine avant exécution.",
          },
          {
            role: "user",
            content: `${ctx}\nANALYSE:${JSON.stringify(analysis)}\nPLAN:${JSON.stringify(plan)}\nARCHITECTURE:${JSON.stringify(architecture)}\nRED TEAM:${JSON.stringify(redTeam)}\nVALIDATION:${JSON.stringify(validation)}`,
          },
        ],
        max_tokens: 700,
      },
      "reasoning",
    );
    synthesis = c?.choices?.[0]?.message?.content ?? "";
  } catch {
    synthesis = (analysis?.state as string) ?? "Synthèse indisponible (routeur IA saturé).";
  }

  return {
    objective,
    analysis: analysis as MissionReport["analysis"],
    plan: plan as MissionReport["plan"],
    architecture: architecture as MissionReport["architecture"],
    redTeam: redTeam as MissionReport["redTeam"],
    validation: validation as MissionReport["validation"],
    synthesis,
    durationMs: Date.now() - start,
  };
}
