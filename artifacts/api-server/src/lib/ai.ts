import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";
import { chatComplete, hasLlmProvider } from "./llm";
import { INJECTION_GUARD } from "./prompt-guard";
import { systemInstructionFor } from "./products";

// Lazy init: the Groq SDK throws at construction when the key is missing,
// which would crash the whole server at startup. Defer it so the API still
// boots (only transcription fails) when GROQ_API_KEY is absent.
let groqClient: Groq | null = null;
function getGroq(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

if (!process.env.GEMINI_API_KEY) {
  // Non-fatal: server boots, but all Gemini-powered endpoints will fail at
  // request time with a clear error rather than a cryptic SDK crash.
  console.warn("[TAMS] GEMINI_API_KEY is not set — AI features will be unavailable.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export interface ExtractedData {
  tasks: Array<{
    title: string;
    dueDate?: string | null;
    priority: "high" | "medium" | "low";
    priorityDomain?: string | null;
  }>;
  events: Array<{
    title: string;
    eventDate: string;
    eventTime?: string | null;
    category: "work" | "family" | "admin" | "personal" | "health";
  }>;
  learnings: Array<{
    subject: string;
    content: string;
    category: "technical" | "professional" | "personal" | "administrative";
  }>;
  tamsComment?: string | null;
}

const PRIORITY_COMPASS = `
BOUSSOLE DE PRIORITÉS TAMS (du plus au moins important) :
1. Santé physique et mentale (health)
2. Famille et relations (family)
3. Obligations administratives et stabilité financière (admin)
4. Stabilité et évolution professionnelle (work)
5. Projets et ambitions personnelles (projects)
6. Productivité (productivity)
`;

const MAX_ITEMS = 50;
const TASK_PRIORITIES = new Set(["high", "medium", "low"]);
const EVENT_CATEGORIES = new Set(["work", "family", "admin", "personal", "health"]);
const LEARNING_CATEGORIES = new Set(["technical", "professional", "personal", "administrative"]);

function asString(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * The LLM output is untrusted: it may contain out-of-enum values, oversized
 * arrays, or wrong types (incl. via prompt injection in the capture). Clamp
 * and validate before anything reaches the database.
 */
function sanitizeExtracted(raw: unknown): ExtractedData {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(obj.tasks) ? obj.tasks.slice(0, MAX_ITEMS) : [];
  const events = Array.isArray(obj.events) ? obj.events.slice(0, MAX_ITEMS) : [];
  const learnings = Array.isArray(obj.learnings) ? obj.learnings.slice(0, MAX_ITEMS) : [];

  return {
    tasks: tasks
      .map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        const title = asString(o.title, 500);
        if (!title) return null;
        const priority = TASK_PRIORITIES.has(o.priority as string)
          ? (o.priority as "high" | "medium" | "low")
          : "medium";
        return {
          title,
          dueDate: typeof o.dueDate === "string" ? o.dueDate.slice(0, 10) : null,
          priority,
          priorityDomain: typeof o.priorityDomain === "string" ? o.priorityDomain.slice(0, 50) : null,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null),
    events: events
      .map((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        const title = asString(o.title, 500);
        const eventDate = asString(o.eventDate, 10);
        if (!title || !eventDate) return null;
        const category = EVENT_CATEGORIES.has(o.category as string)
          ? (o.category as "work" | "family" | "admin" | "personal" | "health")
          : "personal";
        return {
          title,
          eventDate,
          eventTime: typeof o.eventTime === "string" ? o.eventTime.slice(0, 5) : null,
          category,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null),
    learnings: learnings
      .map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        const subject = asString(o.subject, 500);
        const learningContent = asString(o.content, 5000);
        if (!subject || !learningContent) return null;
        const category = LEARNING_CATEGORIES.has(o.category as string)
          ? (o.category as "technical" | "professional" | "personal" | "administrative")
          : "personal";
        return { subject, content: learningContent, category };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null),
    tamsComment: typeof obj.tamsComment === "string" ? obj.tamsComment.slice(0, 5000) : null,
  };
}

export async function extractFromCapture(content: string): Promise<ExtractedData> {
  const today = new Date().toISOString().split("T")[0];

  // Bound the prompt input regardless of upstream validation (defense in depth).
  const safeContent = content.slice(0, 10_000);

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${PRIORITY_COMPASS}${INJECTION_GUARD}

Tu es TAMS, un copilote de vie intelligent. Tu analyses ce que l'utilisateur a capturé et extrais les éléments importants.

IMPORTANT : TAMS ne flatte jamais. TAMS est honnête, calme, pragmatique et bienveillant.
Si tu détectes une surcharge, un perfectionnisme, une dispersion ou une incohérence avec les priorités → signale-le dans tamsComment.

Date du jour : ${today}

Capture de l'utilisateur :
"${safeContent}"

Réponds UNIQUEMENT avec du JSON valide dans ce format exact :
{
  "tasks": [
    {
      "title": "string",
      "dueDate": "YYYY-MM-DD ou null",
      "priority": "high|medium|low",
      "priorityDomain": "health|family|admin|work|projects|productivity"
    }
  ],
  "events": [
    {
      "title": "string",
      "eventDate": "YYYY-MM-DD",
      "eventTime": "HH:MM ou null",
      "category": "work|family|admin|personal|health"
    }
  ],
  "learnings": [
    {
      "subject": "string",
      "content": "string",
      "category": "technical|professional|personal|administrative"
    }
  ],
  "tamsComment": "string ou null — commentaire bienveillant mais honnête de TAMS, surtout si détection de surcharge, d'incohérence ou de risque"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    return sanitizeExtracted(JSON.parse(jsonMatch[0]));
  } catch (err) {
    logger.error({ err }, "Failed to extract from capture");
    return { tasks: [], events: [], learnings: [], tamsComment: null };
  }
}

export async function analyzeDecision(question: string, context?: string | null): Promise<{
  analysis: string;
  priorityConflicts: string;
  alternatives: string;
  blindSpots: string;
}> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const safeQuestion = question.slice(0, 4000);
  const safeContext = context ? context.slice(0, 4000) : null;

  const prompt = `${PRIORITY_COMPASS}${INJECTION_GUARD}

Tu es TAMS, un copilote de vie. L'utilisateur soumet une décision importante pour analyse.

RÈGLES RED TEAM :
- Identifie TOUJOURS les conflits de priorités selon la boussole TAMS
- Sois honnête sur les risques même s'ils sont inconfortables
- Propose des alternatives réalistes
- Identifie les angles morts que l'utilisateur n'a peut-être pas vus
- Ne flatte jamais, ne culpabilise jamais
- Reste calme, pragmatique et bienveillant

Question : "${safeQuestion}"
${safeContext ? `Contexte : "${safeContext}"` : ""}

Réponds en JSON :
{
  "analysis": "Analyse complète en 2-3 paragraphes",
  "priorityConflicts": "Conflits identifiés avec la boussole de priorités (ex: améliore les revenus mais réduit le temps familial)",
  "alternatives": "2-3 alternatives concrètes",
  "blindSpots": "Ce que l'utilisateur n'a peut-être pas considéré"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      analysis:          asString(raw.analysis,          8000),
      priorityConflicts: asString(raw.priorityConflicts, 4000),
      alternatives:      asString(raw.alternatives,      4000),
      blindSpots:        asString(raw.blindSpots,        4000),
    };
  } catch (err) {
    logger.error({ err }, "Failed to analyze decision");
    return {
      analysis: "Analyse non disponible.",
      priorityConflicts: "Impossible d'analyser les conflits.",
      alternatives: "Impossible de générer des alternatives.",
      blindSpots: "Impossible d'identifier les angles morts.",
    };
  }
}

export async function generateMorningTamsMessage(data: {
  pendingTasks: number;
  highPriorityTasks: number;
  overdueTasks: number;
  todayEvents: number;
  recentEnergyAvg: number | null;
  consecutiveWorkDays: number;
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es TAMS. Génère un message matinal court (2-3 phrases max) pour l'utilisateur.

Données :
- Tâches en attente : ${data.pendingTasks} (dont ${data.highPriorityTasks} haute priorité, ${data.overdueTasks} en retard)
- Événements aujourd'hui : ${data.todayEvents}
- Énergie moyenne récente : ${data.recentEnergyAvg ?? "inconnue"}/10
- Jours consécutifs de travail : ${data.consecutiveWorkDays}

RÈGLES :
- Sois honnête et bienveillant, jamais flatteur
- Si surcharge détectée : signale-le clairement mais calmement
- Si tout va bien : message positif et ancré
- JAMAIS de culpabilisation
- Maximum 3 phrases courtes`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return "Bonne journée. Focus sur ce qui compte vraiment.";
  }
}

export async function generateEveningResponse(review: {
  mostImportantThing: string;
  energyLevel: number;
  deferredItems?: string | null;
  abandonedItems?: string | null;
  freeReflection?: string | null;
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es TAMS. L'utilisateur fait sa revue du soir. Génère une réponse courte (3-4 phrases).

Revue :
- Plus important aujourd'hui : "${review.mostImportantThing}"
- Niveau d'énergie : ${review.energyLevel}/10
${review.deferredItems ? `- Reporté : "${review.deferredItems}"` : ""}
${review.abandonedItems ? `- Abandonné : "${review.abandonedItems}"` : ""}
${review.freeReflection ? `- Réflexion : "${review.freeReflection}"` : ""}

RÈGLES RED TEAM :
- Si énergie < 5 : signale le besoin de récupération
- Si abandon de tâches : valide cette décision (c'est sage, pas un échec)
- Si énergie bonne : encourage sans flatter
- Pose UNE question de réflexion pertinente pour demain
- Jamais de culpabilisation`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return "Merci pour cette réflexion. Repose-toi bien — demain est une nouvelle page.";
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string = "audio/webm"): Promise<string> {
  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const file = new File([buffer], "audio.webm", { type: mimeType });

    const transcription = await getGroq().audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "fr",
      response_format: "json",
    });

    return transcription.text;
  } catch (err) {
    logger.error({ err }, "Transcription failed");
    throw new Error("Transcription failed");
  }
}

export async function generateWeeklySummary(data: {
  energyAvg: number | null;
  energyMin: number | null;
  energyMax: number | null;
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;
  decisionsCount: number;
  capturesCount: number;
  reviewsCount: number;
  topDomains: string[];
  weekDates: { start: string; end: string };
}): Promise<{ tamsMessage: string; trend: string; recommendation: string }> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${PRIORITY_COMPASS}

Tu es TAMS. Génère le bilan de semaine de l'utilisateur. Sois honnête, calme, sans flatterie.

Données de la semaine (${data.weekDates.start} → ${data.weekDates.end}) :
- Énergie moyenne : ${data.energyAvg !== null ? `${data.energyAvg.toFixed(1)}/10` : "non mesurée"}
- Énergie min/max : ${data.energyMin ?? "?"} / ${data.energyMax ?? "?"}
- Tâches terminées : ${data.tasksCompleted}
- Tâches en attente : ${data.tasksPending}
- Tâches en retard : ${data.tasksOverdue}
- Décisions analysées : ${data.decisionsCount}
- Captures faites : ${data.capturesCount}
- Revues du soir complétées : ${data.reviewsCount}/7
- Domaines principaux : ${data.topDomains.join(", ") || "non identifiés"}

Réponds UNIQUEMENT en JSON :
{
  "tamsMessage": "Message principal de TAMS sur la semaine (3-4 phrases, honnête, ancré dans les données)",
  "trend": "Tendance observée en 1-2 phrases (énergie, rythme, focus)",
  "recommendation": "Une recommandation concrète et actionnable pour la semaine prochaine (1-2 phrases)"
}

RÈGLES : jamais flatteur, jamais culpabilisant. Si la semaine était difficile, dis-le calmement.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      tamsMessage:    asString(raw.tamsMessage,    4000),
      trend:          asString(raw.trend,          2000),
      recommendation: asString(raw.recommendation, 2000),
    };
  } catch {
    return {
      tamsMessage: "Semaine enregistrée. Prends un moment pour souffler avant de repartir.",
      trend: "Données insuffisantes pour identifier une tendance claire.",
      recommendation: "Commence la semaine prochaine par définir tes 3 priorités absolues.",
    };
  }
}

export interface RecordingAnalysis {
  summary: string;
  actionItems: Array<{ title: string; owner?: string; deadline?: string; priority: string }>;
  commitments: Array<{ who: string; what: string; deadline?: string }>;
  decisions: Array<{ topic: string; decision: string; rationale?: string }>;
  blindSpots: string;
  redTeamCritique: string;
  tamsMessage: string;
}

export async function analyzeRecording(
  transcript: string,
  title: string,
  meetingType: string = "meeting",
  context?: string | null
): Promise<RecordingAnalysis> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const safeTranscript = transcript.slice(0, 40_000);
  const safeTitle = title.slice(0, 500);
  const safeContext = context?.slice(0, 2000) ?? null;

  const typeLabels: Record<string, string> = {
    meeting: "réunion",
    call: "appel téléphonique",
    brainstorm: "brainstorming",
    voice: "mémo vocal",
  };

  const prompt = `${INJECTION_GUARD}${PRIORITY_COMPASS}

Tu es TAMS, copilote de vie en mode RED TEAM. Tu analyses la transcription d'un enregistrement.

TYPE : ${typeLabels[meetingType] || meetingType}
TITRE : "${safeTitle}"
${safeContext ? `CONTEXTE FOURNI : "${safeContext}"` : ""}

TRANSCRIPTION COMPLÈTE :
---
${safeTranscript}
---

ANALYSE RED TEAM COMPLÈTE — sois honnête, précis, ne flatte jamais.

Réponds UNIQUEMENT en JSON valide :
{
  "summary": "Résumé factuel de ce qui s'est réellement dit (2-4 paragraphes). Pas d'interprétation positive automatique — décris ce qui a été dit, pas ce qu'on voulait dire.",
  "actionItems": [
    {
      "title": "Action concrète à entreprendre",
      "owner": "Qui doit le faire (moi, un collègue, personne mentionnée)",
      "deadline": "Délai mentionné ou null",
      "priority": "high|medium|low"
    }
  ],
  "commitments": [
    {
      "who": "Qui a pris l'engagement",
      "what": "Ce qui a été promis (même implicitement)",
      "deadline": "Délai ou null"
    }
  ],
  "decisions": [
    {
      "topic": "Sujet de la décision",
      "decision": "Ce qui a été décidé",
      "rationale": "Raison donnée ou null"
    }
  ],
  "blindSpots": "Ce qui N'A PAS été dit mais aurait dû l'être. Questions importantes évitées. Sujets tabous. Éléphants dans la pièce. Sois direct.",
  "redTeamCritique": "Critique honnête et sans complaisance : signaux d'alarme, incohérences entre ce qui est dit et ce qui est implicite, risques ignorés, dynamiques de groupe problématiques, engagements irréalistes, décisions précipitées. Ce que tu observes vraiment.",
  "tamsMessage": "Message final de TAMS à l'utilisateur : évaluation globale honnête de cet enregistrement et une recommandation actionnable pour la suite. 2-3 phrases."
}

RÈGLES ABSOLUES :
- Les engagements implicites comptent autant que les explicites
- Si la transcription manque de clarté → dis-le dans redTeamCritique
- Si des décisions importantes ont été évitées → dis-le dans blindSpots
- Ne génère pas de faux positifs : s'il n'y a pas d'action items, dis-le
- Priorise "high" uniquement pour les vraies urgences`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    return {
      summary: asString(raw.summary, 8000),
      actionItems: Array.isArray(raw.actionItems)
        ? raw.actionItems.slice(0, 50).map((item: unknown) => {
            const i = (item ?? {}) as Record<string, unknown>;
            return {
              title: asString(i.title, 500),
              owner: typeof i.owner === "string" ? i.owner.slice(0, 200) : undefined,
              deadline: typeof i.deadline === "string" ? i.deadline.slice(0, 100) : undefined,
              priority: ["high", "medium", "low"].includes(i.priority as string)
                ? (i.priority as string)
                : "medium",
            };
          }).filter((i) => i.title)
        : [],
      commitments: Array.isArray(raw.commitments)
        ? raw.commitments.slice(0, 30).map((item: unknown) => {
            const c = (item ?? {}) as Record<string, unknown>;
            return {
              who: asString(c.who, 200),
              what: asString(c.what, 500),
              deadline: typeof c.deadline === "string" ? c.deadline.slice(0, 100) : undefined,
            };
          }).filter((c) => c.who && c.what)
        : [],
      decisions: Array.isArray(raw.decisions)
        ? raw.decisions.slice(0, 20).map((item: unknown) => {
            const d = (item ?? {}) as Record<string, unknown>;
            return {
              topic: asString(d.topic, 300),
              decision: asString(d.decision, 1000),
              rationale: typeof d.rationale === "string" ? d.rationale.slice(0, 500) : undefined,
            };
          }).filter((d) => d.topic && d.decision)
        : [],
      blindSpots: asString(raw.blindSpots, 4000),
      redTeamCritique: asString(raw.redTeamCritique, 6000),
      tamsMessage: asString(raw.tamsMessage, 2000),
    };
  } catch (err) {
    logger.error({ err }, "Failed to analyze recording");
    return {
      summary: "Analyse non disponible. Réessaie.",
      actionItems: [],
      commitments: [],
      decisions: [],
      blindSpots: "Analyse indisponible.",
      redTeamCritique: "Analyse indisponible.",
      tamsMessage: "L'analyse n'a pas pu être générée. Vérifie ta connexion et réessaie.",
    };
  }
}

export async function detectOverload(data: {
  activeTasks: number;
  consecutiveWorkDays: number;
  recentEnergyAvg: number | null;
  taskAddedVsCompletedRatio: number;
}): Promise<{ riskLevel: "none" | "low" | "medium" | "high" | "critical"; alerts: string[]; suggestion: string | null }> {
  const alerts: string[] = [];
  let score = 0;

  if (data.consecutiveWorkDays >= 12) { alerts.push(`Tu as travaillé ${data.consecutiveWorkDays} jours consécutifs sans véritable récupération.`); score += 3; }
  else if (data.consecutiveWorkDays >= 7) { alerts.push(`${data.consecutiveWorkDays} jours de travail consécutifs — une pause s'impose bientôt.`); score += 1; }

  if (data.activeTasks > 30) { alerts.push("Tu accumules plus vite que tu n'avances."); score += 2; }
  else if (data.activeTasks > 20) { alerts.push("Le nombre de tâches actives est élevé."); score += 1; }

  if (data.recentEnergyAvg !== null && data.recentEnergyAvg < 4) { alerts.push("Ton niveau d'énergie diminue depuis plusieurs jours."); score += 2; }
  else if (data.recentEnergyAvg !== null && data.recentEnergyAvg < 6) { score += 1; }

  if (data.taskAddedVsCompletedRatio > 2) { alerts.push("Tu ajoutes davantage de tâches que tu n'en termines."); score += 1; }

  let riskLevel: "none" | "low" | "medium" | "high" | "critical" = "none";
  if (score >= 6) riskLevel = "critical";
  else if (score >= 4) riskLevel = "high";
  else if (score >= 2) riskLevel = "medium";
  else if (score >= 1) riskLevel = "low";

  let suggestion: string | null = null;
  if (riskLevel === "critical" || riskLevel === "high") {
    suggestion = "Ralentir pourrait être plus bénéfique qu'ajouter de nouvelles responsabilités. Protège ta récupération.";
  } else if (riskLevel === "medium") {
    suggestion = "Ce rythme de travail n'est probablement pas soutenable sur la durée. Identifie ce que tu peux reporter.";
  }

  return { riskLevel, alerts, suggestion };
}

export interface LeadScore {
  score: number;                   // 0-100
  conversionProbability: number;   // 0-100
  priority: "high" | "medium" | "low";
  nextBestAction: string;
  redTeamWarning: string | null;
  rationale: string;
}

/** Score a lead with Red Team analysis via Gemini */
export async function scoreLead(lead: {
  name: string;
  company?: string | null;
  role?: string | null;
  industry?: string | null;
  source?: string | null;
  notes?: string | null;
  painPoints?: string | null;
  budget?: string | null;
  decisionTimeline?: string | null;
  signals?: string | null;
  companySize?: string | null;
  status?: string | null;
}): Promise<LeadScore> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `${INJECTION_GUARD}

Tu es un expert en sales B2B avec une approche Red Team : tu identifies objectivement la qualité d'un lead sans optimisme excessif.

Analyse ce lead et retourne un scoring JSON précis.

LEAD :
- Nom : ${lead.name}
- Entreprise : ${lead.company ?? "non renseigné"}
- Rôle : ${lead.role ?? "non renseigné"}
- Secteur : ${lead.industry ?? "non renseigné"}
- Taille entreprise : ${lead.companySize ?? "non renseigné"}
- Source : ${lead.source ?? "manual"}
- Budget : ${lead.budget ?? "non renseigné"}
- Timeline décision : ${lead.decisionTimeline ?? "non renseigné"}
- Pain points : ${lead.painPoints ?? "non renseigné"}
- Signaux / contexte : ${lead.signals ?? "aucun"}
- Notes : ${lead.notes ?? "aucune"}
- Statut actuel : ${lead.status ?? "new"}

CRITÈRES DE SCORING :
- score (0-100) : qualité globale du lead (fit produit, urgence, budget, décideur, signaux)
- conversionProbability (0-100) : probabilité réaliste de conversion basée sur les infos disponibles
- priority : high si score >= 70 et timeline < 3 mois, low si score < 40 ou très peu d'info
- nextBestAction : action concrète et immédiate à faire maintenant (max 1 phrase)
- redTeamWarning : signal d'alarme ou risque caché (null si aucun) — ex : décideur absent, budget vague, timing trop long, concurrent cité, silence inhabituel
- rationale : explication courte du scoring (2-3 phrases max)

RÈGLES :
- Ne sois PAS optimiste par défaut. Un lead sans budget ni timeline = score < 50.
- Le redTeamWarning est le signal le plus important — ne le noie pas.
- nextBestAction doit être IMMÉDIATE et SPÉCIFIQUE (pas "faire un suivi").

Réponds UNIQUEMENT avec ce JSON (aucun texte autour) :
{
  "score": <number 0-100>,
  "conversionProbability": <number 0-100>,
  "priority": "<high|medium|low>",
  "nextBestAction": "<string>",
  "redTeamWarning": <string|null>,
  "rationale": "<string>"
}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(raw);

  return {
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    conversionProbability: Math.max(0, Math.min(100, Number(parsed.conversionProbability) || 0)),
    priority: ["high", "medium", "low"].includes(parsed.priority) ? parsed.priority : "medium",
    nextBestAction: String(parsed.nextBestAction ?? ""),
    redTeamWarning: parsed.redTeamWarning ? String(parsed.redTeamWarning) : null,
    rationale: String(parsed.rationale ?? ""),
  };
}

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * General conversational copilot. Routes through the multi-provider LLM
 * gateway (`lib/llm`), so it works with any configured free provider
 * (Gemini, Groq, or a local Ollama model) and falls back automatically.
 * Never throws — degrades to a clear message.
 */
export async function copilotChat(messages: CopilotMessage[], productId?: string | null): Promise<string> {
  if (!hasLlmProvider()) {
    return "L'assistant IA n'est pas configuré. Ajoute une clé (GEMINI_API_KEY ou GROQ_API_KEY) ou un serveur local (OLLAMA_BASE_URL) pour activer le Copilot.";
  }

  const trimmed = messages
    .slice(-20)
    .map((m) => ({ role: m.role, content: asString(m.content, 4000) }))
    .filter((m) => m.content.length > 0);

  const last = trimmed[trimmed.length - 1];
  if (!last || last.role !== "user") {
    return "Pose-moi une question pour commencer.";
  }

  // The system instruction is chosen by the active product vertical (persona).
  const systemInstruction = systemInstructionFor(productId);

  try {
    const { text } = await chatComplete(trimmed, { system: systemInstruction });
    return text || "Je n'ai pas de réponse pour le moment.";
  } catch (err) {
    logger.error({ err }, "Copilot chat failed");
    return "Désolé, l'assistant a rencontré une erreur. Réessaie dans un instant.";
  }
}
