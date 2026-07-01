export type DevAgentMode = "analyze" | "preview";

export type ProposedFileChange = {
  path: string;
  content: string;
  reason?: string;
};

export type DevAgentCoreInput = {
  objective: string;
  mode?: DevAgentMode;
  changes?: ProposedFileChange[];
};

export type PermissionCheck = {
  ok: boolean;
  path: string;
  severity: "info" | "blocked";
  reason: string;
};

const BLOCKED_PATHS = [
  /^\.env(?:\.|$)/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)\.tsbuildinfo$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
];

const VALIDATION_COMMANDS = [
  "pnpm install --no-frozen-lockfile --lockfile=false",
  "BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/tams run build",
  "pnpm --filter @workspace/api-server run build",
  "pnpm run typecheck",
  "pnpm --filter @workspace/scripts test",
  "pnpm --filter @workspace/scripts dev-runtime:scenario",
  "pnpm --filter @workspace/scripts dev-runtime:mission2",
  "curl health/version/registry/capabilities endpoints",
];

function checkPath(path: string): PermissionCheck {
  if (!path || path.startsWith("/") || path.includes("..")) {
    return { ok: false, path, severity: "blocked", reason: "Chemin invalide" };
  }
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(path)) return { ok: false, path, severity: "blocked", reason: "Chemin sensible bloqué" };
  }
  return { ok: true, path, severity: "info", reason: "Chemin autorisé" };
}

function previewDiff(change: ProposedFileChange): string {
  const lines = change.content.split("\n").slice(0, 160);
  return [
    `diff --git a/${change.path} b/${change.path}`,
    `--- a/${change.path}`,
    `+++ b/${change.path}`,
    "@@ preview @@",
    ...lines.map(line => `+${line}`),
    change.content.split("\n").length > lines.length ? "+... [preview truncated]" : "",
  ].filter(Boolean).join("\n");
}

export function runDevAgentCore(input: DevAgentCoreInput) {
  const objective = input.objective?.trim() || "Rapprocher TAMS de Claude Code avec sécurité.";
  const mode = input.mode ?? "analyze";
  const changes = input.changes ?? [];
  const permissionChecks = changes.map(change => checkPath(change.path));
  const refused = permissionChecks.some(check => !check.ok);
  const patchPreview = changes.length > 0
    ? changes.map((change, index) => permissionChecks[index]?.ok ? previewDiff(change) : `BLOCKED ${change.path}: ${permissionChecks[index]?.reason}`).join("\n\n")
    : "Aucun patch fourni. Mode analyse uniquement.";

  const layers = [
    { name: "Repo Intelligence", status: "ready_v1", detail: "Analyse structurelle via repo.audit." },
    { name: "Terminal sécurisé", status: "contract_v1", detail: "Commandes autorisées, exécution réelle via CI ou runtime isolé." },
    { name: "Patch Preview", status: "ready_v1", detail: "Diff lisible avant action." },
    { name: "Validation Engine", status: "ready_v1", detail: "Build, typecheck, tests et smoke obligatoires." },
    { name: "Error Repair Loop", status: "contract_v1", detail: "Lire logs, corriger, relancer, abandonner honnêtement si bloqué." },
    { name: "GitHub Operator", status: "guarded_v1", detail: "Branche et PR via actions protégées." },
    { name: "Browser/E2E Operator", status: "planned_v1", detail: "À brancher via Playwright/Cypress." },
    { name: "Permission Layer", status: refused ? "blocked" : "pass", detail: "Chemins sensibles bloqués." },
    { name: "Memory / Knowledge Base", status: "ready_v1", detail: "Décisions et erreurs à persister en mémoire." },
    { name: "Scheduler / Multi-agent", status: "planned_v1", detail: "À brancher via n8n/automations." },
  ];

  return {
    ok: !refused,
    mode,
    verdict: refused ? "REFUSED" : changes.length > 0 ? "NEEDS_REVIEW" : "PASS",
    objective,
    summary: refused
      ? "Permission Layer a refusé au moins un changement."
      : changes.length > 0
        ? "Patch Preview prêt. Aucun fichier modifié automatiquement."
        : "Dev Agent Core v1 prêt : architecture, permissions et validation sont en place.",
    layers,
    permissionChecks,
    patchPreview,
    validationPlan: {
      allowlistedCommands: VALIDATION_COMMANDS,
      requiredBeforeMerge: ["build success", "typecheck success", "tests success", "smoke success", "human review"],
    },
    nextActions: [
      "Utiliser repo.audit pour lire le repo réel.",
      "Générer changes[] puis lancer dev.agent.core en mode preview.",
      "Valider le diff avant toute action d’écriture.",
      "Attendre CI et corriger en boucle jusqu’à PASS.",
    ],
    limitations: [
      "Pas de shell libre dans l’application production.",
      "Le terminal réel doit passer par CI, sandbox ou worker isolé.",
      "Le Browser/E2E Operator arrive dans une PR séparée.",
    ],
  };
}
