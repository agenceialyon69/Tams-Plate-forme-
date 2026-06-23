import { logger } from "../logger";

/**
 * Web search (modular, free providers).
 *
 * Lets the Copilot ground its answers on fresh web results. Providers, in
 * order of quality:
 *  - tavily     : AI-optimised search, free tier  → TAVILY_API_KEY
 *  - brave      : Brave Search API, free tier      → BRAVE_API_KEY
 *  - searxng    : self/your-hosted metasearch      → SEARXNG_URL
 *  - duckduckgo : keyless Instant Answer (fallback, limited, no key/server)
 *
 * "auto" tries the configured providers best-first, always ending on the
 * keyless DuckDuckGo fallback so search works with zero configuration.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function clampLimit(n: number | undefined): number {
  return Math.min(Math.max(Number(n) || 5, 1), 10);
}

/** Providers usable now (duckduckgo is always available — keyless). */
export function searchProviders(): string[] {
  const list: string[] = [];
  if (process.env.TAVILY_API_KEY) list.push("tavily");
  if (process.env.BRAVE_API_KEY) list.push("brave");
  if (process.env.SEARXNG_URL) list.push("searxng");
  list.push("duckduckgo");
  return list;
}

export function isWebSearchAvailable(): boolean {
  return searchProviders().length > 0; // always true (duckduckgo), kept for symmetry
}

async function searchTavily(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: limit,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 500),
  }));
}

async function searchBrave(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_API_KEY ?? "",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.description ?? "").slice(0, 500),
  }));
}

async function searchSearxng(query: string, limit: number): Promise<SearchResult[]> {
  const base = (process.env.SEARXNG_URL ?? "").replace(/\/$/, "");
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`SearXNG ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).slice(0, limit).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 500),
  }));
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  const results: SearchResult[] = [];
  if (data.AbstractText) {
    results.push({ title: data.Heading ?? query, url: data.AbstractURL ?? "", snippet: data.AbstractText });
  }
  for (const t of data.RelatedTopics ?? []) {
    if (t.Text && t.FirstURL) results.push({ title: t.Text.slice(0, 120), url: t.FirstURL, snippet: t.Text });
    if (results.length >= limit) break;
  }
  return results.slice(0, limit);
}

/** Search the web via the first working provider (best-first, keyless fallback). */
export async function searchWeb(query: string, limit = 5): Promise<{ results: SearchResult[]; provider: string }> {
  const q = query.slice(0, 400).trim();
  if (!q) return { results: [], provider: "none" };
  const n = clampLimit(limit);

  const pref = (process.env.WEB_SEARCH_PROVIDER || "auto").toLowerCase().trim();
  const order = pref !== "auto" ? [pref, "duckduckgo"] : searchProviders();

  let lastErr: unknown = null;
  for (const provider of order) {
    try {
      let results: SearchResult[] = [];
      if (provider === "tavily" && process.env.TAVILY_API_KEY) results = await searchTavily(q, n);
      else if (provider === "brave" && process.env.BRAVE_API_KEY) results = await searchBrave(q, n);
      else if (provider === "searxng" && process.env.SEARXNG_URL) results = await searchSearxng(q, n);
      else if (provider === "duckduckgo") results = await searchDuckDuckGo(q, n);
      else continue;
      if (results.length > 0) return { results, provider };
    } catch (err) {
      lastErr = err;
      logger.warn({ err, provider }, "Web search provider failed, trying next");
    }
  }
  if (lastErr) logger.warn({ err: lastErr }, "All web search providers failed or empty");
  return { results: [], provider: "none" };
}

/** Compact, model-friendly rendering of results for prompt grounding. */
export function formatResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return "";
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join("\n\n");
}
