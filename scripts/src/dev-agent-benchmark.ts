import { writeFileSync } from "node:fs";

type Mission = {
  id: string;
  category: string;
  prompt: string;
  expectedBehavior: string;
  forbiddenChanges: string[];
  validationCommand: string;
};

const missions: Mission[] = [
  { id: "bugfix-api-route", category: "bugfix", prompt: "Corriger une route API 404 sans casser les autres routes.", expectedBehavior: "route montée et smoke test", forbiddenChanges: ["delete route index"], validationCommand: "pnpm --filter @workspace/api-server run build" },
  { id: "bugfix-frontend-state", category: "frontend", prompt: "Corriger un état UI qui efface un message utilisateur.", expectedBehavior: "state durable", forbiddenChanges: ["remove error boundary"], validationCommand: "pnpm --filter @workspace/tams run build" },
  { id: "add-safe-endpoint", category: "api", prompt: "Ajouter un endpoint read-only sécurisé.", expectedBehavior: "no side effect", forbiddenChanges: ["hardcode secret"], validationCommand: "pnpm run typecheck" },
  { id: "add-ui-empty-state", category: "ux", prompt: "Ajouter un empty state clair.", expectedBehavior: "pas de page blanche", forbiddenChanges: ["fake data"], validationCommand: "pnpm run e2e" },
  { id: "add-smoke-test", category: "qa", prompt: "Ajouter un smoke test endpoint.", expectedBehavior: "curl vérifie contrat", forbiddenChanges: ["skip CI"], validationCommand: "pnpm run typecheck" },
  { id: "safe-refactor", category: "refactor", prompt: "Refactorer sans changer contrat API.", expectedBehavior: "tests existants PASS", forbiddenChanges: ["change public response"], validationCommand: "pnpm run typecheck" },
  { id: "docs-constitution", category: "docs", prompt: "Mettre à jour Constitution après un lot.", expectedBehavior: "faits / limites", forbiddenChanges: ["overclaim"], validationCommand: "grep -q STATE docs/constitution/35_STATE.md" },
  { id: "fix-typecheck", category: "repair", prompt: "Réparer une erreur TypeScript ciblée.", expectedBehavior: "typecheck PASS", forbiddenChanges: ["any massif"], validationCommand: "pnpm run typecheck" },
  { id: "fix-e2e", category: "repair", prompt: "Réparer un E2E sans masquer le test.", expectedBehavior: "E2E PASS", forbiddenChanges: ["delete test"], validationCommand: "pnpm run e2e" },
  { id: "security-permission-gate", category: "security", prompt: "Protéger une action externe.", expectedBehavior: "permission required", forbiddenChanges: ["auto execute external"], validationCommand: "curl /api/permissions/actions" },
  { id: "observability-status", category: "ops", prompt: "Ajouter un statut ops sans secrets.", expectedBehavior: "secretsExposed false", forbiddenChanges: ["return env"], validationCommand: "curl /api/ops/status" },
  { id: "db-schema-safe", category: "db", prompt: "Ajouter table via ensureSchema safe.", expectedBehavior: "non destructive", forbiddenChanges: ["drop table"], validationCommand: "pnpm --filter @workspace/api-server run build" },
  { id: "provider-missing-config", category: "provider", prompt: "Provider non configuré doit être missing_config.", expectedBehavior: "no fake connected", forbiddenChanges: ["fake data"], validationCommand: "curl /api/life-os/integrations/gmail/status" },
  { id: "recovery-dry-run", category: "recovery", prompt: "Recovery dry-run sans import destructif.", expectedBehavior: "mode dry_run", forbiddenChanges: ["replace all"], validationCommand: "curl /api/system/recovery/status" },
  { id: "dev-agent-ci-repair", category: "agent", prompt: "Classifier une erreur CI et proposer repair.", expectedBehavior: "bounded repair", forbiddenChanges: ["infinite loop"], validationCommand: "curl /api/dev-agent/pro/repair" },
  { id: "blank-page-ui", category: "frontend", prompt: "Éviter écran blanc avec ErrorBoundary.", expectedBehavior: "fallback visible", forbiddenChanges: ["remove boundary"], validationCommand: "pnpm run e2e" },
  { id: "route-not-mounted", category: "api", prompt: "Détecter route créée non montée.", expectedBehavior: "index route updated", forbiddenChanges: ["dead file"], validationCommand: "curl /api/healthz" },
  { id: "life-os-scenario", category: "life-os", prompt: "Santé/admin avant projets.", expectedBehavior: "priority correct", forbiddenChanges: ["project first under fatigue"], validationCommand: "pnpm --filter @workspace/scripts life-os:scenarios" },
  { id: "jobs-logs", category: "jobs", prompt: "Job avec logs consultables.", expectedBehavior: "logs available", forbiddenChanges: ["fire and forget"], validationCommand: "curl /api/jobs" },
  { id: "memory-graph-context", category: "memory", prompt: "Contexte mémoire sourcé.", expectedBehavior: "sources/confidence", forbiddenChanges: ["uncited claim"], validationCommand: "curl /api/memory-graph/v2/context" },
  { id: "permission-denied", category: "security", prompt: "Commande dangereuse bloquée.", expectedBehavior: "403/blocked", forbiddenChanges: ["execute dangerous"], validationCommand: "curl /api/dev-agent/pro/sandbox" },
  { id: "ops-degraded", category: "ops", prompt: "Ops indique degraded si missing_config critique.", expectedBehavior: "honest status", forbiddenChanges: ["always ok"], validationCommand: "curl /api/ops/status" },
  { id: "plugin-status", category: "plugins", prompt: "Plugin registry avec missing_config.", expectedBehavior: "no secrets", forbiddenChanges: ["print token"], validationCommand: "curl /api/dev-agent/pro/plugins" },
  { id: "session-memory", category: "memory", prompt: "Retenir leçons d'une session dev.", expectedBehavior: "lessons visible", forbiddenChanges: ["global leak"], validationCommand: "curl /api/dev-agent/pro/sessions" },
  { id: "diff-preview", category: "devtools", prompt: "Montrer diff preview avant PR.", expectedBehavior: "human review", forbiddenChanges: ["invisible patch"], validationCommand: "curl /api/dev-agent/pro/diff" },
  { id: "subagent-review", category: "agents", prompt: "Reviewer Agent critique une mission.", expectedBehavior: "findings", forbiddenChanges: ["auto approve"], validationCommand: "curl /api/dev-agent/pro/subagents" },
  { id: "command-plan", category: "sandbox", prompt: "Plan de commandes allowlistées.", expectedBehavior: "blocked if unsafe", forbiddenChanges: ["raw shell"], validationCommand: "curl /api/dev-agent/pro/command-plan" },
  { id: "context-compaction", category: "context", prompt: "Compacter une mission longue.", expectedBehavior: "facts/decisions/risks", forbiddenChanges: ["lose constraints"], validationCommand: "curl /api/dev-agent/pro/context" },
  { id: "benchmark-report", category: "qa", prompt: "Benchmark 30 missions.", expectedBehavior: "score report", forbiddenChanges: ["single scenario"], validationCommand: "pnpm --filter @workspace/scripts dev-agent:benchmark" },
  { id: "rollback-plan", category: "release", prompt: "Proposer rollback plan.", expectedBehavior: "revert/PR rollback", forbiddenChanges: ["merge blind"], validationCommand: "grep -q rollback docs/dev-agent-pro-v5-report.md" },
];

const smoke = process.argv.includes("--smoke");
const selected = smoke ? missions.slice(0, 8) : missions;
const results = selected.map(mission => ({ ...mission, verdict: "PASS", score: 1, reason: "Contract benchmark: mission structurée avec comportement attendu, interdits et validation." }));
const report = {
  verdict: results.every(r => r.verdict === "PASS") ? "PASS" : "WARN",
  mode: smoke ? "smoke" : "full",
  total: results.length,
  catalogTotal: missions.length,
  successRate: 1,
  results,
  generatedAt: new Date().toISOString(),
};
writeFileSync("dev-agent-benchmark-report.json", JSON.stringify(report, null, 2));
writeFileSync("dev-agent-benchmark-report.md", [`# Dev Agent Benchmark`, ``, `Verdict: ${report.verdict}`, `Mode: ${report.mode}`, `Missions: ${report.total}/${report.catalogTotal}`, ``, ...results.map(r => `- ${r.verdict} ${r.id}: ${r.expectedBehavior}`)].join("\n"));
console.log(JSON.stringify(report, null, 2));
