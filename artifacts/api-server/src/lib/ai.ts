import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

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
  koreComment?: string | null;
}

const PRIORITY_COMPASS = `
BOUSSOLE DE PRIORITÉS KORE (du plus au moins important) :
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
    koreComment: typeof obj.koreComment === "string" ? obj.koreComment.slice(0, 5000) : null,
  };
}

export async function extractFromCapture(content: string): Promise<ExtractedData> {
  const today = new Date().toISOString().split("T")[0];

  // Bound the prompt input regardless of upstream validation (defense in depth).
  const safeContent = content.slice(0, 10_000);

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${PRIORITY_COMPASS}

Tu es KORE, un copilote de vie intelligent. Tu analyses ce que l'utilisateur a capturé et extrais les éléments importants.

IMPORTANT : KORE ne flatte jamais. KORE est honnête, calme, pragmatique et bienveillant.
Si tu détectes une surcharge, un perfectionnisme, une dispersion ou une incohérence avec les priorités → signale-le dans koreComment.

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
  "koreComment": "string ou null — commentaire bienveillant mais honnête de KORE, surtout si détection de surcharge, d'incohérence ou de risque"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    return sanitizeExtracted(JSON.parse(jsonMatch[0]));
  } catch (err) {
    logger.error({ err }, "Failed to extract from capture");
    return { tasks: [], events: [], learnings: [], koreComment: null };
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

  const prompt = `${PRIORITY_COMPASS}

Tu es KORE, un copilote de vie. L'utilisateur soumet une décision importante pour analyse.

RÈGLES RED TEAM :
- Identifie TOUJOURS les conflits de priorités selon la boussole KORE
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
    return JSON.parse(jsonMatch[0]);
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

export async function generateMorningKoreMessage(data: {
  pendingTasks: number;
  highPriorityTasks: number;
  overdueTasks: number;
  todayEvents: number;
  recentEnergyAvg: number | null;
  consecutiveWorkDays: number;
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Tu es KORE. Génère un message matinal court (2-3 phrases max) pour l'utilisateur.

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

  const prompt = `Tu es KORE. L'utilisateur fait sa revue du soir. Génère une réponse courte (3-4 phrases).

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
}): Promise<{ koreMessage: string; trend: string; recommendation: string }> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${PRIORITY_COMPASS}

Tu es KORE. Génère le bilan de semaine de l'utilisateur. Sois honnête, calme, sans flatterie.

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
  "koreMessage": "Message principal de KORE sur la semaine (3-4 phrases, honnête, ancré dans les données)",
  "trend": "Tendance observée en 1-2 phrases (énergie, rythme, focus)",
  "recommendation": "Une recommandation concrète et actionnable pour la semaine prochaine (1-2 phrases)"
}

RÈGLES : jamais flatteur, jamais culpabilisant. Si la semaine était difficile, dis-le calmement.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      koreMessage: "Semaine enregistrée. Prends un moment pour souffler avant de repartir.",
      trend: "Données insuffisantes pour identifier une tendance claire.",
      recommendation: "Commence la semaine prochaine par définir tes 3 priorités absolues.",
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
