/**
 * MON AGENT — Code Operator (LECTURE SEULE) façon Claude Code, free-first.
 *
 * Compréhension de repo via l'API GitHub (gratuite, GITHUB_TOKEN existant) :
 *   - readFile   : contenu d'un fichier
 *   - listTree   : arborescence (chemins)
 *   - searchCode : recherche de code
 *
 * RÈGLE DE VÉRITÉ : sans GITHUB_TOKEN, on lève MissingGithubConfig (route → 503).
 * Jamais de faux contenu. AUCUNE écriture ici (l'écriture branche/commit/PR
 * viendra dans une PR dédiée, derrière confirmation + flag + jamais main).
 *
 * Réutilise les primitives testées de dev-agent-ci-operator (github/redact/repo).
 */
import { github, repoName, split, redact, githubConfigured, createPullRequest } from "./dev-agent-ci-operator.js";

export class MissingGithubConfig extends Error {
  constructor() {
    super("GITHUB_TOKEN manquant : opérateur de code non connecté");
    this.name = "MissingGithubConfig";
  }
}

/** Flag d'écriture (TAMS_DEV_AGENT_PR_WRITE) désactivé. */
export class WriteFlagDisabled extends Error {
  constructor() {
    super("Écriture désactivée : activer TAMS_DEV_AGENT_PR_WRITE=true côté serveur");
    this.name = "WriteFlagDisabled";
  }
}

function ensureConfigured(): void {
  if (!githubConfigured()) throw new MissingGithubConfig();
}

function writeEnabled(): boolean {
  return process.env.TAMS_DEV_AGENT_PR_WRITE === "true";
}

export interface RepoFile {
  repo: string;
  path: string;
  ref: string;
  size: number;
  sha: string;
  truncated: boolean;
  content: string;
}

/** Branche par défaut du repo (main/master/…) — pour lister l'arbre. */
async function defaultBranch(repo: string): Promise<string> {
  const info = (await github(`/repos/${repo}`)) as Record<string, unknown>;
  const b = typeof info.default_branch === "string" ? info.default_branch : "main";
  return b;
}

const MAX_FILE_CHARS = 60_000;

/** Contenu d'un fichier (décodé, borné, secrets caviardés). */
export async function readFile(input: { repo?: string; path: string; ref?: string }): Promise<RepoFile> {
  ensureConfigured();
  const repo = repoName(input.repo);
  const path = input.path.replace(/^\/+/, "").trim();
  if (!path) throw new Error("path requis");
  const refQuery = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
  const data = (await github(`/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}${refQuery}`)) as Record<string, unknown>;

  if (Array.isArray(data)) throw new Error(`"${path}" est un dossier, pas un fichier (utilise l'arborescence)`);
  if (data.type !== "file") throw new Error(`"${path}" n'est pas un fichier lisible (type: ${String(data.type)})`);

  const encoded = typeof data.content === "string" ? data.content : "";
  const raw = Buffer.from(encoded, "base64").toString("utf8");
  const safe = redact(raw);
  const truncated = safe.length > MAX_FILE_CHARS;
  return {
    repo,
    path,
    ref: input.ref || (typeof data.sha === "string" ? data.sha : "HEAD"),
    size: typeof data.size === "number" ? data.size : raw.length,
    sha: typeof data.sha === "string" ? data.sha : "",
    truncated,
    content: truncated ? safe.slice(0, MAX_FILE_CHARS) : safe,
  };
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number | null;
}

/** Arborescence du repo (chemins), bornée. */
export async function listTree(input: { repo?: string; ref?: string; limit?: number } = {}): Promise<{ repo: string; ref: string; truncated: boolean; entries: TreeEntry[] }> {
  ensureConfigured();
  const repo = repoName(input.repo);
  const ref = input.ref || (await defaultBranch(repo));
  const data = (await github(`/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)) as Record<string, unknown>;
  const rawTree = Array.isArray(data.tree) ? (data.tree as Record<string, unknown>[]) : [];
  const limit = Math.min(Math.max(Number(input.limit) || 2000, 1), 5000);
  const entries: TreeEntry[] = rawTree.slice(0, limit).map(e => ({
    path: String(e.path ?? ""),
    type: e.type === "tree" ? "tree" : "blob",
    size: typeof e.size === "number" ? e.size : null,
  }));
  return { repo, ref, truncated: Boolean(data.truncated) || rawTree.length > limit, entries };
}

export interface CodeHit {
  path: string;
  name: string;
  url: string;
}

/** Recherche de code dans le repo (GitHub Code Search). */
export async function searchCode(input: { repo?: string; query: string; limit?: number }): Promise<{ repo: string; query: string; total: number; hits: CodeHit[] }> {
  ensureConfigured();
  const repo = repoName(input.repo);
  const { owner, name } = split(repo);
  const q = input.query.trim();
  if (!q) throw new Error("query requise");
  const full = `${q} repo:${owner}/${name}`;
  const data = (await github(`/search/code?q=${encodeURIComponent(full)}&per_page=${Math.min(Math.max(Number(input.limit) || 10, 1), 30)}`)) as Record<string, unknown>;
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const hits: CodeHit[] = items.map(it => ({
    path: String(it.path ?? ""),
    name: String(it.name ?? ""),
    url: String(it.html_url ?? ""),
  }));
  return { repo, query: q, total: typeof data.total_count === "number" ? data.total_count : hits.length, hits };
}

// ─── ÉCRITURE — branche → commit → PR (jamais main, jamais merge) ─────────────

export interface ProposeInput {
  repo?: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
}

/**
 * Crée une branche dédiée avec les fichiers fournis (via git trees API) puis
 * ouvre une PR. Ordre des garde-fous pensé pour être testable :
 *   1. validation d'entrée (400)  2. flag d'écriture (403)  3. token (503)
 * Ne merge JAMAIS. head protégé (jamais main/master) — vérifié ici ET dans
 * createPullRequest.
 */
export async function proposeChange(input: ProposeInput): Promise<{
  repo: string; branch: string; base: string; commit: string; filesChanged: number;
  pr: { repo: string; number: unknown; url: unknown; state: unknown };
}> {
  // 1. Validation (ne nécessite ni flag ni token).
  const branch = (input.branch || "").trim();
  if (!branch) throw new Error("branch requise (branche dédiée, jamais main/master)");
  if (branch === "main" || branch === "master") throw new Error("branche protégée : choisis une branche dédiée, jamais main/master");
  if (!/^[\w./-]+$/.test(branch) || branch.startsWith("/") || branch.includes("..")) throw new Error("nom de branche invalide");
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length === 0) throw new Error("files requis : au moins un fichier { path, content }");
  for (const f of files) {
    if (!f || typeof f.path !== "string" || !f.path.trim() || typeof f.content !== "string") {
      throw new Error("chaque fichier requiert path (string) et content (string)");
    }
  }

  // 2. Flag d'écriture (403).
  if (!writeEnabled()) throw new WriteFlagDisabled();

  // 3. Token (503).
  ensureConfigured();

  const repo = repoName(input.repo);
  const base = await defaultBranch(repo);
  if (branch === base) throw new Error(`branche cible == branche par défaut (${base}) : choisis une branche dédiée`);

  // Base commit + tree.
  const ref = (await github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`)) as Record<string, any>;
  const baseCommitSha = ref?.object?.sha;
  if (typeof baseCommitSha !== "string") throw new Error("impossible de résoudre la branche de base");
  const baseCommit = (await github(`/repos/${repo}/git/commits/${baseCommitSha}`)) as Record<string, any>;
  const baseTreeSha = baseCommit?.tree?.sha;

  // Nouvel arbre (contenu inline → GitHub crée les blobs).
  const tree = files.map(f => ({ path: f.path.replace(/^\/+/, ""), mode: "100644", type: "blob", content: f.content }));
  const newTree = (await github(`/repos/${repo}/git/trees`, { method: "POST", body: { base_tree: baseTreeSha, tree } })) as Record<string, any>;

  // Commit.
  const commit = (await github(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: { message: input.commitMessage || "TAMS: proposition de changements", tree: newTree.sha, parents: [baseCommitSha] },
  })) as Record<string, any>;

  // Nouvelle branche (échoue proprement si elle existe déjà).
  await github(`/repos/${repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: commit.sha } });

  // PR (createPullRequest ré-applique flag + protection head, ne merge jamais).
  const pr = await createPullRequest({ repo, head: branch, base, title: input.prTitle || "TAMS: proposition de changements", body: input.prBody });

  return { repo, branch, base, commit: String(commit.sha), filesChanged: files.length, pr };
}
