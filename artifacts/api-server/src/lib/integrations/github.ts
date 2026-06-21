import { logger } from "../logger";

/**
 * GitHub integration (modular, feature-flagged).
 *
 * Connects to a user's GitHub account through the official REST API using a
 * Personal Access Token. Enabled only when GITHUB_TOKEN is set — every call
 * site checks `isGithubConfigured()` first, so the app runs fine without it.
 * The token is never hardcoded and never returned to the client.
 *
 * Scopes typically needed: `repo` (private repos) or `public_repo`, plus
 * `read:user`. Create one at https://github.com/settings/tokens
 */

const API_BASE = "https://api.github.com";

/** True when a GitHub token is configured (integration enabled). */
export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

interface GithubRequestOptions {
  method?: string;
  body?: unknown;
}

async function githubRequest<T>(path: string, opts: GithubRequestOptions = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "TAMS-Platform",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.warn({ status: res.status, path }, "GitHub API error");
    throw new Error(`GitHub API ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface GithubViewer {
  login: string;
  name: string | null;
  publicRepos: number;
  privateRepos: number;
  avatarUrl: string;
  htmlUrl: string;
}

/** The authenticated account (who the token belongs to). */
export async function githubViewer(): Promise<GithubViewer> {
  const u = await githubRequest<{
    login: string;
    name: string | null;
    public_repos: number;
    total_private_repos?: number;
    owned_private_repos?: number;
    avatar_url: string;
    html_url: string;
  }>("/user");
  return {
    login: u.login,
    name: u.name,
    publicRepos: u.public_repos ?? 0,
    privateRepos: u.total_private_repos ?? u.owned_private_repos ?? 0,
    avatarUrl: u.avatar_url,
    htmlUrl: u.html_url,
  };
}

export interface GithubRepo {
  fullName: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
  openIssues: number;
  language: string | null;
}

/** Repositories the token can access, most recently pushed first. */
export async function listRepos(limit = 20): Promise<GithubRepo[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const repos = await githubRequest<
    Array<{
      full_name: string;
      description: string | null;
      private: boolean;
      html_url: string;
      updated_at: string;
      open_issues_count: number;
      language: string | null;
    }>
  >(`/user/repos?per_page=${safeLimit}&sort=pushed&affiliation=owner,collaborator`);
  return repos.map((r) => ({
    fullName: r.full_name,
    description: r.description,
    private: r.private,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
    openIssues: r.open_issues_count ?? 0,
    language: r.language,
  }));
}

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  isPullRequest: boolean;
  updatedAt: string;
}

/** Open issues/PRs for a repo (owner/name), most recently updated first. */
export async function listIssues(owner: string, repo: string, limit = 20): Promise<GithubIssue[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const issues = await githubRequest<
    Array<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      pull_request?: unknown;
      updated_at: string;
    }>
  >(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?per_page=${safeLimit}&state=open&sort=updated`);
  return issues.map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    htmlUrl: i.html_url,
    isPullRequest: Boolean(i.pull_request),
    updatedAt: i.updated_at,
  }));
}

/** Create an issue in a repo (owner/name). Returns the new issue URL/number. */
export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body?: string
): Promise<{ number: number; htmlUrl: string }> {
  const created = await githubRequest<{ number: number; html_url: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    { method: "POST", body: { title: title.slice(0, 256), body: (body ?? "").slice(0, 60_000) } }
  );
  return { number: created.number, htmlUrl: created.html_url };
}
