import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { tasksTable, decisionsTable, memoriesTable, activityTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router = Router();

type DomainId = "health" | "family" | "admin_finance" | "work_stability" | "projects" | "learning";
type RiskLevel = "low" | "medium" | "high";

const DOMAINS: Array<{ id: DomainId; label: string; weight: number; guardrail: string }> = [
  { id: "health", label: "Santé physique & mentale", weight: 1.35, guardrail: "Aucune ambition ne justifie de casser la santé." },
  { id: "family", label: "Famille & relations", weight: 1.25, guardrail: "Le système protège le temps familial avant l'optimisation." },
  { id: "admin_finance", label: "Admin & finances", weight: 1.2, guardrail: "Tout risque administratif, juridique ou financier remonte avant les projets." },
  { id: "work_stability", label: "Stabilité professionnelle", weight: 1.1, guardrail: "Le revenu stable protège la famille et les projets." },
  { id: "projects", label: "Projets & ambitions", weight: 0.9, guardrail: "Un seul levier projet à la fois quand l'énergie est basse." },
  { id: "learning", label: "Apprentissage", weight: 0.75, guardrail: "Apprendre sans créer de surcharge." },
];

const CaptureBody = z.object({ text: z.string().min(2).max(4000), source: z.string().max(64).optional(), persist: z.boolean().default(false) });
const RedTeamBody = z.object({ decision: z.string().min(3).max(2000), context: z.string().max(4000).optional(), energy: z.number().min(0).max(100).optional(), urgency: z.number().min(0).max(100).optional() });

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))); }
function includesAny(text: string, words: string[]) { const t = text.toLowerCase(); return words.some(w => t.includes(w)); }

async function loadSignals() {
  const [taskStats, decisionStats, memories, activity, recentTasks, recentActivity] = await Promise.all([
    db.select({
      total: sql<number>`COUNT(*)`,
      done: sql<number>`COUNT(CASE WHEN ${tasksTable.status} = 'done' THEN 1 END)`,
      active: sql<number>`COUNT(CASE WHEN ${tasksTable.status} <> 'done' THEN 1 END)`,
      urgent: sql<number>`COUNT(CASE WHEN ${tasksTable.priority} IN ('high','urgent') AND ${tasksTable.status} <> 'done' THEN 1 END)`,
      dueSoon: sql<number>`COUNT(CASE WHEN ${tasksTable.dueDate} IS NOT NULL AND ${tasksTable.dueDate} <= CURRENT_DATE + INTERVAL '7 days' AND ${tasksTable.status} <> 'done' THEN 1 END)`,
    }).from(tasksTable).catch(() => [{ total: 0, done: 0, active: 0, urgent: 0, dueSoon: 0 }]),
    db.select({
      total: sql<number>`COUNT(*)`,
      open: sql<number>`COUNT(CASE WHEN ${decisionsTable.status} IN ('pending','analyzing') THEN 1 END)`,
      lowConfidence: sql<number>`COUNT(CASE WHEN ${decisionsTable.confidenceScore} < 60 THEN 1 END)`,
    }).from(decisionsTable).catch(() => [{ total: 0, open: 0, lowConfidence: 0 }]),
    db.select({ count: sql<number>`COUNT(*)` }).from(memoriesTable).catch(() => [{ count: 0 }]),
    db.select({ count: sql<number>`COUNT(*)` }).from(activityTable).catch(() => [{ count: 0 }]),
    db.select().from(tasksTable).orderBy(desc(tasksTable.updatedAt)).limit(8).catch(() => []),
    db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(8).catch(() => []),
  ]);
  const tasks = taskStats[0] ?? { total: 0, done: 0, active: 0, urgent: 0, dueSoon: 0 };
  const decisions = decisionStats[0] ?? { total: 0, open: 0, lowConfidence: 0 };
  return {
    tasks: { total: Number(tasks.total ?? 0), done: Number(tasks.done ?? 0), active: Number(tasks.active ?? 0), urgent: Number(tasks.urgent ?? 0), dueSoon: Number(tasks.dueSoon ?? 0) },
    decisions: { total: Number(decisions.total ?? 0), open: Number(decisions.open ?? 0), lowConfidence: Number(decisions.lowConfidence ?? 0) },
    memories: Number(memories[0]?.count ?? 0),
    activity: Number(activity[0]?.count ?? 0),
    recentTasks: (recentTasks as any[]).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate ?? null })),
    recentActivity: (recentActivity as any[]).map(a => ({ type: a.type, title: a.title, createdAt: a.createdAt })),
  };
}

function buildDomains(signals: Awaited<ReturnType<typeof loadSignals>>) {
  const completion = signals.tasks.total > 0 ? signals.tasks.done / signals.tasks.total : 0;
  const overload = Math.min(30, signals.tasks.active * 2 + signals.tasks.urgent * 5 + signals.tasks.dueSoon * 3);
  const decisionDebt = Math.min(20, signals.decisions.open * 4 + signals.decisions.lowConfidence * 3);
  const dataPenalty = signals.memories < 5 ? 10 : 0;
  const domains = [
    { ...DOMAINS[0], score: clamp(78 - overload), status: overload > 20 ? "fragile" : "stable" },
    { ...DOMAINS[1], score: clamp(74 - Math.min(18, signals.tasks.active)), status: signals.tasks.active > 10 ? "à protéger" : "stable" },
    { ...DOMAINS[2], score: clamp(68 - signals.tasks.urgent * 6 - signals.tasks.dueSoon * 4), status: signals.tasks.urgent + signals.tasks.dueSoon > 0 ? "à traiter" : "stable" },
    { ...DOMAINS[3], score: clamp(70 - decisionDebt - Math.min(8, signals.tasks.urgent * 2)), status: decisionDebt > 8 ? "risque décisionnel" : "stable" },
    { ...DOMAINS[4], score: clamp(45 + completion * 40 - overload / 2), status: overload > 18 ? "ralentir" : "avancer" },
    { ...DOMAINS[5], score: clamp(66 - dataPenalty - Math.min(10, signals.tasks.active)), status: dataPenalty > 0 ? "peu de données" : "stable" },
  ];
  const weighted = domains.reduce((sum, d) => sum + d.score * d.weight, 0) / domains.reduce((sum, d) => sum + d.weight, 0);
  return { domains, overallScore: clamp(weighted) };
}

function buildRisks(signals: Awaited<ReturnType<typeof loadSignals>>): Array<{ id: string; level: RiskLevel; title: string; reason: string; antidote: string }> {
  const risks: Array<{ id: string; level: RiskLevel; title: string; reason: string; antidote: string }> = [];
  if (signals.tasks.active > 12 || signals.tasks.urgent > 2) risks.push({ id: "overload", level: "high", title: "Surcharge probable", reason: `${signals.tasks.active} tâches actives, ${signals.tasks.urgent} urgentes.`, antidote: "Choisir 3 tâches maximum aujourd'hui et reporter le reste." });
  if (signals.tasks.dueSoon > 0) risks.push({ id: "admin_deadline", level: signals.tasks.dueSoon > 2 ? "high" : "medium", title: "Échéances proches", reason: `${signals.tasks.dueSoon} élément(s) à échéance proche.`, antidote: "Traiter en premier ce qui crée pénalité, dette ou risque légal." });
  if (signals.decisions.open > 3) risks.push({ id: "decision_debt", level: "medium", title: "Dette décisionnelle", reason: `${signals.decisions.open} décisions ouvertes.`, antidote: "Fermer ou mettre en pause les décisions non critiques." });
  if (signals.memories < 5) risks.push({ id: "low_context", level: "medium", title: "Mémoire insuffisante", reason: "Peu de contexte personnel structuré.", antidote: "Capturer les contraintes réelles : santé, famille, horaires, finances, travail." });
  if (risks.length === 0) risks.push({ id: "stable", level: "low", title: "Risque global bas", reason: "Aucun signal critique détecté dans les données actuelles.", antidote: "Continuer à capturer les décisions et obligations réelles." });
  return risks;
}

function buildPlan(signals: Awaited<ReturnType<typeof loadSignals>>, risks: ReturnType<typeof buildRisks>) {
  const plan = [
    { order: 1, domain: "health", action: "Faire un check énergie/stress/douleur avant d'ajouter une tâche.", timeboxMinutes: 5 },
    { order: 2, domain: "admin_finance", action: signals.tasks.dueSoon > 0 ? "Traiter l'échéance la plus risquée aujourd'hui." : "Vérifier qu'aucune échéance admin/finance n'est oubliée.", timeboxMinutes: 20 },
    { order: 3, domain: "work_stability", action: "Protéger la stabilité professionnelle et éviter les décisions sous fatigue.", timeboxMinutes: 15 },
    { order: 4, domain: "projects", action: risks.some(r => r.id === "overload") ? "Ne faire qu'une micro-action projet réversible." : "Avancer une action projet à impact mesurable.", timeboxMinutes: 30 },
  ];
  return plan;
}

async function buildCockpit() {
  const signals = await loadSignals();
  const { domains, overallScore } = buildDomains(signals);
  const riskRadar = buildRisks(signals);
  const nextActions = buildPlan(signals, riskRadar);
  return {
    ok: true,
    version: "life_os_v5_foundation",
    generatedAt: new Date().toISOString(),
    doctrine: "Santé → famille → admin/finance → stabilité pro → projets → apprentissage.",
    overallScore,
    domains,
    riskRadar,
    nextActions,
    signals,
    council: [
      { agent: "Health Guardian", role: "bloque la surcharge et le burn-out" },
      { agent: "Family Guardian", role: "protège temps familial et relations" },
      { agent: "Admin Risk Officer", role: "priorise échéances, preuves, obligations" },
      { agent: "Career Stability Officer", role: "protège revenu stable et énergie" },
      { agent: "Project Strategist", role: "limite la dispersion et choisit un levier" },
      { agent: "Red Team", role: "attaque les hypothèses et expose les angles morts" },
    ],
  };
}

function classifyCapture(text: string) {
  const domain: DomainId = includesAny(text, ["mal", "douleur", "santé", "fatigue", "stress", "sommeil"]) ? "health"
    : includesAny(text, ["famille", "bébé", "fille", "couple", "ma femme", "ma copine"]) ? "family"
    : includesAny(text, ["facture", "amende", "caf", "préfecture", "papier", "dette", "impôt", "assurance"]) ? "admin_finance"
    : includesAny(text, ["travail", "emploi", "salaire", "entretien", "cdi", "mission"]) ? "work_stability"
    : includesAny(text, ["projet", "tams", "kore", "claire", "shopify", "github"]) ? "projects"
    : "learning";
  const priority = domain === "health" || domain === "admin_finance" ? "high" : domain === "work_stability" ? "medium" : "low";
  const suggestedTask = domain === "health" ? "Décider si consultation/repos/check santé est nécessaire"
    : domain === "admin_finance" ? "Créer une action avec date limite et preuve écrite"
    : domain === "family" ? "Protéger un créneau famille sans projet"
    : domain === "work_stability" ? "Clarifier le prochain pas professionnel stable"
    : domain === "projects" ? "Découper en une action projet de 30 minutes"
    : "Transformer en note d'apprentissage";
  return { domain, priority, suggestedTask };
}

router.get("/life-os/status", async (_req, res) => res.json(await buildCockpit()));
router.get("/life-os/briefing", async (_req, res) => res.json({ ...(await buildCockpit()), title: "Briefing Life OS v5" }));
router.get("/life-os/v5/cockpit", async (_req, res) => res.json(await buildCockpit()));
router.get("/life-os/v5/score", async (_req, res) => { const c = await buildCockpit(); return res.json({ ok: true, overallScore: c.overallScore, domains: c.domains, generatedAt: c.generatedAt }); });
router.get("/life-os/v5/risk-radar", async (_req, res) => { const c = await buildCockpit(); return res.json({ ok: true, riskRadar: c.riskRadar, generatedAt: c.generatedAt }); });
router.get("/life-os/v5/plan", async (_req, res) => { const c = await buildCockpit(); return res.json({ ok: true, nextActions: c.nextActions, doctrine: c.doctrine, generatedAt: c.generatedAt }); });
router.get("/life-os/workflows", async (_req, res) => res.json({ ok: true, version: "v5_templates", templates: [
  { id: "daily_health_check", priority: "health", title: "Check santé quotidien", outcome: "Détecter fatigue/douleur/stress avant surcharge." },
  { id: "admin_risk_review", priority: "admin_finance", title: "Revue admin/finance", outcome: "Remonter amendes, factures, papiers, échéances." },
  { id: "family_time_guard", priority: "family", title: "Garde-fou famille", outcome: "Empêcher que projets/travail mangent tout le temps familial." },
  { id: "weekly_red_team_review", priority: "projects", title: "Red Team hebdo", outcome: "Stopper dispersion et décisions prises sous fatigue." },
] }));
router.get("/life-os/v5/workflows", async (_req, res) => res.redirect(307, "/api/life-os/workflows"));

router.post("/life-os/v5/capture", async (req, res) => {
  const parsed = CaptureBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid input", details: parsed.error.issues });
  const { text, source, persist } = parsed.data;
  const classification = classifyCapture(text);
  const result: any = { ok: true, mode: persist ? "persisted" : "preview", text, source: source ?? "manual", classification, nextActions: [classification.suggestedTask, "Relier cette capture à une tâche, décision ou mémoire."] };
  if (persist) {
    const [memory] = await db.insert(memoriesTable).values({ title: `Capture Life OS — ${classification.domain}`, type: "note" as any, content: text, tags: ["life-os", classification.domain], relatedIds: [] } as any).returning({ id: memoriesTable.id });
    const [task] = await db.insert(tasksTable).values({ title: classification.suggestedTask, description: text, status: "todo" as any, priority: classification.priority as any, projectId: null, dueDate: null } as any).returning({ id: tasksTable.id });
    result.persisted = { memoryId: memory?.id ?? null, taskId: task?.id ?? null };
  }
  return res.json(result);
});

router.post("/life-os/red-team", async (req, res) => {
  const parsed = RedTeamBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid input", details: parsed.error.issues });
  const { decision, context, energy = 50, urgency = 50 } = parsed.data;
  const cockpit = await buildCockpit();
  const risk = cockpit.riskRadar[0];
  const block = energy < 35 || risk.level === "high";
  return res.json({
    ok: true,
    version: "life_os_v5_red_team",
    decision,
    context: context ?? null,
    verdict: block ? "Décision à ralentir : risque de surcharge ou angle mort prioritaire." : "Décision possible, mais seulement avec limites et preuve de réussite.",
    redFlags: [
      "Cette décision respecte-t-elle l'ordre santé → famille → admin/finance → stabilité ?",
      "Quelle preuve écrite ou donnée réelle soutient cette décision ?",
      "Quel est le coût en sommeil, énergie, argent et temps familial ?",
      "Quelle option plus petite donne 80% du résultat avec moins de risque ?",
    ],
    constraints: { energy, urgency, topRisk: risk },
    saferPath: [
      "Découper en action réversible de 30 minutes maximum.",
      "Définir une limite de temps, d'argent et d'énergie.",
      "Prévoir un point de revue dans 24h ou après preuve réelle.",
      "Stopper si santé/famille/admin/revenu deviennent fragiles.",
    ],
  });
});
router.post("/life-os/v5/red-team", async (req, res, next) => { req.url = "/life-os/red-team"; next(); });

export default router;
