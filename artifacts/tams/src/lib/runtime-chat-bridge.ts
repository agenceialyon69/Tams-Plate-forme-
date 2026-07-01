export type RuntimeCommandKind = "repo_audit" | "runtime_validation" | "security_check";

export interface RuntimeTaskResponse {
  id: string;
  status: string;
  mode: string;
  strategy: string;
  impactedFiles: string[];
  report: {
    verdict: "PASS" | "FAIL" | "REFUSED" | "APPROVAL_REQUIRED";
    summary: string;
  };
}

export class RuntimeBridgeError extends Error {
  constructor(
    readonly code: "AUTH_REQUIRED" | "REQUEST_FAILED" | "INVALID_RESPONSE",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RuntimeBridgeError";
  }
}

export function matchRuntimeCommand(content: string): RuntimeCommandKind | null {
  const value = content.trim().toLocaleLowerCase("fr");
  if (!value) return null;

  if (
    /(supprime|efface|delete).*(agents\.md)/.test(value) &&
    /(pousse|push).*(main)/.test(value)
  ) return "security_check";

  if (/lance.*validation.*runtime/.test(value)) return "runtime_validation";

  if (
    /(analyse|analyze).*(repo|dépôt|depot)/.test(value) &&
    /(chat os|fichiers.*gèrent|fichiers.*gerent)/.test(value)
  ) return "repo_audit";

  return null;
}

function requestFor(kind: RuntimeCommandKind, objective: string) {
  if (kind === "repo_audit") {
    return { objective, mode: "read_only", strategy: "repo_audit" };
  }
  if (kind === "runtime_validation") {
    return { objective, mode: "deploy_check", strategy: "runtime_validation" };
  }
  return { objective, mode: "commit_candidate" };
}

function isRuntimeTask(value: unknown): value is RuntimeTaskResponse {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<RuntimeTaskResponse>;
  return typeof task.id === "string" && typeof task.status === "string" &&
    Boolean(task.report && typeof task.report.verdict === "string" && typeof task.report.summary === "string");
}

export async function requestRuntimeTask(options: {
  apiBase: string;
  conversationId: number;
  content: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): Promise<RuntimeTaskResponse> {
  const kind = matchRuntimeCommand(options.content);
  if (!kind) throw new RuntimeBridgeError("INVALID_RESPONSE", "Commande runtime non reconnue");

  const token = await options.getAccessToken();
  if (!token) {
    throw new RuntimeBridgeError(
      "AUTH_REQUIRED",
      "Une session Supabase valide est requise pour utiliser le Development Runtime.",
      401,
    );
  }

  const response = await (options.fetchImpl ?? fetch)(
    `${options.apiBase}/api/conversations/${options.conversationId}/runtime`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestFor(kind, options.content)),
    },
  );

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new RuntimeBridgeError("INVALID_RESPONSE", "Réponse runtime invalide", response.status);
  }

  // A security refusal is a successful bridge outcome, represented by HTTP 403.
  if (response.status === 403 && isRuntimeTask(data) && data.report.verdict === "REFUSED") {
    return data;
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `Échec runtime (HTTP ${response.status})`;
    throw new RuntimeBridgeError("REQUEST_FAILED", message, response.status);
  }
  if (!isRuntimeTask(data)) {
    throw new RuntimeBridgeError("INVALID_RESPONSE", "Réponse runtime incomplète", response.status);
  }
  return data;
}
