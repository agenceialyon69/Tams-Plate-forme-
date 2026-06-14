import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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

export async function extractFromCapture(content: string): Promise<ExtractedData> {
  const today = new Date().toISOString().split("T")[0];

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${PRIORITY_COMPASS}

Tu es KORE, un copilote de vie intelligent. Tu analyses ce que l'utilisateur a capturé et extrais les éléments importants.

IMPORTANT : KORE ne flatte jamais. KORE est honnête, calme, pragmatique et bienveillant.
Si tu détectes une surcharge, un perfectionnisme, une dispersion ou une incohérence avec les priorités → signale-le dans koreComment.

Date du jour : ${today}

Capture de l'utilisateur :
"${content}"

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
    return JSON.parse(jsonMatch[0]) as ExtractedData;
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

  const prompt = `${PRIORITY_COMPASS}

Tu es KORE, un copilote de vie. L'utilisateur soumet une décision importante pour analyse.

RÈGLES RED TEAM :
- Identifie TOUJOURS les conflits de priorités selon la boussole KORE
- Sois honnête sur les risques même s'ils sont inconfortables
- Propose des alternatives réalistes
- Identifie les angles morts que l'utilisateur n'a peut-être pas vus
- Ne flatte jamais, ne culpabilise jamais
- Reste calme, pragmatique et bienveillant

Question : "${question}"
${context ? `Contexte : "${context}"` : ""}

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

    const transcription = await groq.audio.transcriptions.create({
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
