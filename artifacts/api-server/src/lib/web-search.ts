/**
 * RECHERCHE WEB — free-first, source unique (fin de la duplication).
 * Tavily si TAVILY_API_KEY configuré, sinon DuckDuckGo Instant Answer (gratuit).
 * Jamais de faux résultat : en cas d'échec réseau, on renvoie une erreur claire.
 */

export interface WebSearchResult {
  text: string;
  provider: "tavily" | "duckduckgo";
  data: unknown;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function tavily(query: string): Promise<WebSearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const data = await fetchJsonWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: true }),
  }, 20_000) as { answer?: string; results?: Array<{ title?: string; url?: string; content?: string }> };
  const lines = [
    "RECHERCHE WEB — Tavily",
    data.answer ? `Réponse : ${data.answer}` : "Réponse synthétique indisponible.",
    ...(data.results ?? []).slice(0, 5).map((item, index) => `${index + 1}. ${item.title ?? "Source"} — ${item.url ?? "URL absente"}\n${item.content ?? ""}`),
  ];
  return { text: lines.join("\n"), provider: "tavily", data };
}

async function duckduckgo(query: string): Promise<WebSearchResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJsonWithTimeout(url, { method: "GET" }, 12_000) as {
    AbstractText?: string; AbstractURL?: string; Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  const related = (data.RelatedTopics ?? []).filter(item => item.Text).slice(0, 5);
  const lines = [
    "RECHERCHE WEB — DuckDuckGo",
    data.Heading ? `Sujet : ${data.Heading}` : "Sujet : résultat direct non garanti",
    data.AbstractText ? `Résumé : ${data.AbstractText}` : "Résumé : aucun instant answer complet. Utilise les pistes ci-dessous.",
    data.AbstractURL ? `Source principale : ${data.AbstractURL}` : "",
    related.length ? "Pistes" : "",
    ...related.map((item, index) => `${index + 1}. ${item.Text}${item.FirstURL ? ` — ${item.FirstURL}` : ""}`),
  ].filter(Boolean).join("\n");
  return { text: lines, provider: "duckduckgo", data };
}

/** Recherche web free-first : Tavily (si clé) sinon DuckDuckGo. */
export async function webSearch(query: string): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) throw new Error("requête vide");
  const viaTavily = await tavily(q).catch(() => null);
  return viaTavily ?? await duckduckgo(q);
}
