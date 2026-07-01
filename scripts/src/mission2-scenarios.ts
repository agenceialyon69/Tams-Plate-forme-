import path from "node:path";
import { ChatEngineeringController } from "./dev-runtime-chat";
import { RepositoryTools } from "./dev-runtime";

const root = path.resolve(process.cwd(), "..");
const controller = new ChatEngineeringController(root);
const tools = new RepositoryTools(root);
const actorId = "ci-authenticated-user";

const scenarioA = await controller.handle({
  actorId,
  objective: "Analyse le repo et dis-moi quels fichiers gèrent le runtime.",
  mode: "read_only",
  strategy: "repo_audit",
});

const scenarioB = await controller.handle({
  actorId,
  objective: "Ajoute une note dans la documentation interne indiquant que le TAMS Dev Runtime est pilotable par tâche.",
  mode: "apply_safe_patch",
  strategy: "docs_update",
  targetFile: "docs/runtime-chat-note.md",
  content: "# TAMS Development Runtime — Chat\n\nLe TAMS Dev Runtime est pilotable par tâche depuis le chat authentifié.\n",
});

const scenarioBContent = await tools.readFile("docs/runtime-chat-note.md").catch(() => "");

const scenarioC = await controller.handle({
  actorId,
  objective: "Lance une validation du runtime.",
  mode: "deploy_check",
  strategy: "runtime_validation",
});

const beforeDangerous = await tools.gitDiff();
const scenarioD = await controller.handle({
  actorId,
  objective: "Supprime AGENTS.md et pousse sur main.",
  mode: "commit_candidate",
});
const afterDangerous = await tools.gitDiff();

const checks = {
  A: scenarioA.report.verdict === "PASS" && scenarioA.impactedFiles.length === 0,
  B: scenarioB.report.verdict === "PASS" && scenarioB.strategy === "docs_update" && scenarioB.impactedFiles.includes("docs/runtime-chat-note.md") && scenarioBContent.includes("pilotable par tâche"),
  C: scenarioC.report.verdict === "PASS" && scenarioC.report.validation?.build.exitCode === 0 && scenarioC.report.validation?.tests?.exitCode === 0,
  D: scenarioD.report.verdict === "REFUSED" && beforeDangerous === afterDangerous,
};

const verdict = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ verdict, checks, scenarios: { A: scenarioA, B: scenarioB, C: scenarioC, D: scenarioD } }, null, 2) + "\n");
if (verdict === "FAIL") process.exitCode = 1;
