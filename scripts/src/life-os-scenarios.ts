import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Domain = "health" | "family" | "admin_finance" | "work_stability" | "projects" | "learning";
type Scenario = {
  name: string;
  input: string;
  expectedDomain: Domain;
  expectedRisk: "low" | "medium" | "high";
  expectedPriority: number;
  expectedAction: string;
};

const priorityOrder: Domain[] = ["health", "family", "admin_finance", "work_stability", "projects", "learning"];

function includesAny(text: string, values: string[]) {
  const normalized = text.toLowerCase();
  return values.some(value => normalized.includes(value));
}

function evaluate(input: string) {
  const matches: Domain[] = [];
  if (includesAny(input, ["douleur", "santé", "fatigue", "stress", "sommeil", "surcharg"])) matches.push("health");
  if (includesAny(input, ["famille", "couple", "enfant", "fille", "parent"])) matches.push("family");
  if (includesAny(input, ["facture", "amende", "dette", "impôt", "deadline", "échéance", "recovery", "gmail", "calendar", "calendrier", "email"])) matches.push("admin_finance");
  if (includesAny(input, ["travail", "emploi", "entretien", "salaire", "cdi", "mission"])) matches.push("work_stability");
  if (includesAny(input, ["projet", "tams", "lancer", "startup"])) matches.push("projects");
  const domain = priorityOrder.find(candidate => matches.includes(candidate)) ?? "learning";
  const risk = domain === "health" || (domain === "admin_finance" && includesAny(input, ["urgent", "deadline", "échéance", "facture"])) ? "high"
    : domain === "family" || domain === "work_stability" || matches.length > 1 ? "medium"
    : "low";
  const action = includesAny(input, ["missing_config", "gmail", "calendar"])
    ? "return_missing_config_without_fake_data"
    : includesAny(input, ["recovery"])
      ? "dry_run_before_approval"
      : domain === "health"
        ? "reduce_load_and_seek_qualified_help_if_needed"
        : domain === "family"
          ? "protect_family_time"
          : domain === "admin_finance"
            ? "secure_deadline_and_written_proof"
            : domain === "work_stability"
              ? "protect_stable_work"
              : domain === "projects"
                ? "one_reversible_project_step"
                : "capture_and_review";
  return { domain, risk, priority: priorityOrder.indexOf(domain) + 1, action };
}

const scenarios: Scenario[] = [
  { name: "Facture urgente", input: "Facture urgente à payer avant la deadline.", expectedDomain: "admin_finance", expectedRisk: "high", expectedPriority: 3, expectedAction: "secure_deadline_and_written_proof" },
  { name: "Douleur / santé", input: "J'ai une douleur persistante et peu d'énergie.", expectedDomain: "health", expectedRisk: "high", expectedPriority: 1, expectedAction: "reduce_load_and_seek_qualified_help_if_needed" },
  { name: "Entretien travail", input: "Préparer mon entretien travail CDI.", expectedDomain: "work_stability", expectedRisk: "medium", expectedPriority: 4, expectedAction: "protect_stable_work" },
  { name: "Conflit calendrier", input: "Conflit calendrier avec une échéance importante.", expectedDomain: "admin_finance", expectedRisk: "high", expectedPriority: 3, expectedAction: "return_missing_config_without_fake_data" },
  { name: "Email important", input: "Email important au sujet d'une facture.", expectedDomain: "admin_finance", expectedRisk: "high", expectedPriority: 3, expectedAction: "return_missing_config_without_fake_data" },
  { name: "Surcharge projets", input: "Je suis en surcharge et je veux lancer trois projets.", expectedDomain: "health", expectedRisk: "high", expectedPriority: 1, expectedAction: "reduce_load_and_seek_qualified_help_if_needed" },
  { name: "Décision travail vs projet", input: "Quitter mon travail stable pour un nouveau projet.", expectedDomain: "work_stability", expectedRisk: "medium", expectedPriority: 4, expectedAction: "protect_stable_work" },
  { name: "Recovery dry-run", input: "Recovery import en dry-run avant toute écriture.", expectedDomain: "admin_finance", expectedRisk: "low", expectedPriority: 3, expectedAction: "dry_run_before_approval" },
  { name: "Automation run", input: "Automation manuelle sans effet externe.", expectedDomain: "learning", expectedRisk: "low", expectedPriority: 6, expectedAction: "capture_and_review" },
  { name: "Coach Red Team", input: "Red Team sur un projet risqué.", expectedDomain: "projects", expectedRisk: "low", expectedPriority: 5, expectedAction: "one_reversible_project_step" },
  { name: "Capture famille", input: "Protéger une soirée famille avec ma fille.", expectedDomain: "family", expectedRisk: "medium", expectedPriority: 2, expectedAction: "protect_family_time" },
  { name: "Admin deadline", input: "Échéance impôt urgente demain.", expectedDomain: "admin_finance", expectedRisk: "high", expectedPriority: 3, expectedAction: "secure_deadline_and_written_proof" },
  { name: "Journée surchargée", input: "Journée surchargée, fatigue et stress.", expectedDomain: "health", expectedRisk: "high", expectedPriority: 1, expectedAction: "reduce_load_and_seek_qualified_help_if_needed" },
  { name: "Projet non prioritaire quand santé fragile", input: "Je suis fatigué avec une douleur mais je veux accélérer mon projet.", expectedDomain: "health", expectedRisk: "high", expectedPriority: 1, expectedAction: "reduce_load_and_seek_qualified_help_if_needed" },
  { name: "Gmail/Calendar missing_config", input: "Gmail et Calendar sont missing_config.", expectedDomain: "admin_finance", expectedRisk: "low", expectedPriority: 3, expectedAction: "return_missing_config_without_fake_data" },
];

const results = scenarios.map(scenario => {
  const actual = evaluate(scenario.input);
  const pass = actual.domain === scenario.expectedDomain
    && actual.risk === scenario.expectedRisk
    && actual.priority === scenario.expectedPriority
    && actual.action === scenario.expectedAction;
  return { ...scenario, actual, verdict: pass ? "PASS" : "FAIL" };
});

const summary = {
  generatedAt: new Date().toISOString(),
  doctrine: "health > family > admin_finance > work_stability > projects > learning",
  total: results.length,
  passed: results.filter(item => item.verdict === "PASS").length,
  failed: results.filter(item => item.verdict === "FAIL").length,
  verdict: results.every(item => item.verdict === "PASS") ? "PASS" : "FAIL",
  results,
};

const markdown = [
  "# Life OS Final — Scenario Report",
  "",
  `Verdict: **${summary.verdict}** — ${summary.passed}/${summary.total} PASS.`,
  "",
  "| Scénario | Domaine attendu | Domaine réel | Risque | Verdict |",
  "|---|---|---|---|---|",
  ...results.map(item => `| ${item.name} | ${item.expectedDomain} | ${item.actual.domain} | ${item.actual.risk} | ${item.verdict} |`),
  "",
  "Règle dure: un projet ne peut jamais passer devant santé, famille, admin/finance ou stabilité.",
].join("\n");

writeFileSync(resolve(process.cwd(), "../life-os-scenarios-report.json"), JSON.stringify(summary, null, 2));
writeFileSync(resolve(process.cwd(), "../docs/life-os-scenarios-report.md"), markdown);
console.log(JSON.stringify(summary, null, 2));
if (summary.verdict !== "PASS") process.exitCode = 1;
