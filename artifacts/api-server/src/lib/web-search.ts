/**
 * RECHERCHE WEB — free-first, source unique (fin de la duplication).
 * Ordre : Tavily (si TAVILY_API_KEY, meilleure qualité) → DuckDuckGo HTML
 * (gratuit, sans clé, vrais résultats) → DuckDuckGo Instant Answer (dernier
 * recours). Jamais de faux résultat : si tout échoue, erreur claire.
 */

export interface WebSearchResult {
  text: string;
  provider: "tavily" | "duckduckgo";
  data: unknown;
}

interface SearchHit { title: string; url: string; snippet: string }

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .split("&amp;").join("&")
    .split("&#x27;").join("'")
    .split("&#39;").join("'")
    .split("&quot;").join('"')
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&nbsp;").join(" ")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/\s+/g, " ")
    .trim();
}

/** Décode l'URL réelle d'un lien DuckDuckGo (//duckduckgo.com/l/?uddg=<encodé>). */
function decodeDdgHref(href: string): string {
  const h = href.replace(/&amp;/g, "&");
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return ""; } }
  if (h.startsWith("http")) return h;
  if (h.startsWith("//")) return "https:" + h;
  return "";
}

function formatHits(provider: string, hits: SearchHit[]): string {
  return [
    `RECHERCHE WEB — ${provider}`,
    ...hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`),
  ].join("\n");
}

async function tavily(query: string): Promise<WebSearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 6, include_answer: true }),
  }, 20_000);
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json() as { answer?: string; results?: Array<{ title?: string; url?: string; content?: string }> };
  const hits: SearchHit[] = (data.results ?? []).slice(0, 6).map(r => ({ title: r.title ?? "Source", url: r.url ?? "", snippet: (r.content ?? "").slice(0, 200) }));
  const text = [data.answer ? `Réponse : ${data.answer}` : "", formatHits("Tavily", hits)].filter(Boolean).join("\n\n");
  return { text, provider: "tavily", data: { answer: data.answer, hits } };
}

/** DuckDuckGo Lite (gratuit, sans clé) — parse de vrais résultats.
 *  NB : l'endpoint html.duckduckgo.com renvoie un 202 anti-bot depuis un
 *  datacenter ; lite.duckduckgo.com répond normalement. */
async function duckduckgoHtml(query: string): Promise<WebSearchResult | null> {
  const res = await fetchWithTimeout(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "text/html",
    },
  }, 15_000);
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();

  // Extraits (colonne result-snippet), dans l'ordre.
  const snippets: string[] = [];
  const snippetRe = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(decodeEntities(sm[1]));

  // Liens de résultats : <a ... href="//duckduckgo.com/l/?uddg=…">Titre</a>.
  const hits: SearchHit[] = [];
  const anchorRe = /<a[^>]+href="(\/\/duckduckgo\.com\/l\/\?uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let am: RegExpExecArray | null;
  let idx = 0;
  while ((am = anchorRe.exec(html)) && hits.length < 6) {
    const url = decodeDdgHref(am[1]);
    const title = decodeEntities(am[2]);
    // Ignore les liens publicitaires DuckDuckGo (y.js / ad_domain) et les liens
    // internes : on ne garde que de vraies sources externes.
    if (!url || !title || /duckduckgo\.com\/y\.js|ad_domain=|ad_provider=/.test(url) || /^https?:\/\/(?:[^/]*\.)?duckduckgo\.com/.test(url)) continue;
    hits.push({ title, url, snippet: snippets[idx] ?? "" });
    idx++;
  }
  if (hits.length === 0) return null;
  return { text: formatHits("DuckDuckGo", hits), provider: "duckduckgo", data: hits };
}

/** Wikipedia (fiable, sans clé) — repli pour les questions de fond/encyclopédiques. */
async function wikipedia(query: string): Promise<WebSearchResult | null> {
  const run = async (lang: string) => {
    const res = await fetchWithTimeout(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&origin=*`,
      { headers: { "User-Agent": "TAMS-Agent/1.0 (veille)" } }, 12_000,
    );
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    const data = await res.json() as { query?: { search?: Array<{ title?: string; snippet?: string }> } };
    return data.query?.search ?? [];
  };
  const results = await run("fr").catch(() => [] as Array<{ title?: string; snippet?: string }>);
  const list = results.length ? results : await run("en").catch(() => [] as Array<{ title?: string; snippet?: string }>);
  if (list.length === 0) return null;
  const lang = results.length ? "fr" : "en";
  const hits: SearchHit[] = list.slice(0, 5).map(r => ({
    title: r.title ?? "",
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent((r.title ?? "").replace(/ /g, "_"))}`,
    snippet: decodeEntities(r.snippet ?? ""),
  }));
  return { text: formatHits("Wikipédia", hits), provider: "duckduckgo", data: hits };
}

/** DuckDuckGo Instant Answer (dernier recours, souvent vide). */
async function duckduckgoInstant(query: string): Promise<WebSearchResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetchWithTimeout(url, { method: "GET" }, 12_000);
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const data = await res.json() as { AbstractText?: string; AbstractURL?: string; Heading?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
  const related = (data.RelatedTopics ?? []).filter(item => item.Text).slice(0, 5);
  const lines = [
    "RECHERCHE WEB — DuckDuckGo (résumé)",
    data.Heading ? `Sujet : ${data.Heading}` : "",
    data.AbstractText ? `Résumé : ${data.AbstractText}` : "Aucun résumé direct — voir pistes.",
    data.AbstractURL ? `Source : ${data.AbstractURL}` : "",
    ...related.map((item, i) => `${i + 1}. ${item.Text}${item.FirstURL ? ` — ${item.FirstURL}` : ""}`),
  ].filter(Boolean).join("\n");
  return { text: lines, provider: "duckduckgo", data };
}

/**
 * Recherche web free-first :
 *   1. Tavily (si TAVILY_API_KEY) — FIABLE depuis un serveur.
 *   2. DuckDuckGo Lite — gratuit sans clé, mais INSTABLE depuis un datacenter
 *      (DuckDuckGo bloque les IP serveur par intermittence : 202 anti-bot).
 *   3. Wikipédia — fiable sans clé, mais encyclopédique uniquement.
 *   4. DuckDuckGo Instant Answer — dernier recours.
 * Si tout échoue : erreur honnête invitant à configurer la clé gratuite Tavily.
 */
export async function webSearch(query: string): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) throw new Error("requête vide");

  const viaTavily = await tavily(q).catch(() => null);
  if (viaTavily) return viaTavily;

  const viaDdg = await duckduckgoHtml(q).catch(() => null);
  if (viaDdg) return viaDdg;

  const viaWiki = await wikipedia(q).catch(() => null);
  if (viaWiki) return viaWiki;

  const viaInstant = await duckduckgoInstant(q).catch(() => null);
  if (viaInstant && Array.isArray((viaInstant.data as { RelatedTopics?: unknown[] })?.RelatedTopics)
      && ((viaInstant.data as { RelatedTopics?: unknown[] }).RelatedTopics?.length ?? 0) > 0) {
    return viaInstant;
  }

  throw new Error(
    "Recherche web indisponible pour l'instant (DuckDuckGo bloque temporairement les serveurs, et aucune clé Tavily n'est configurée). "
    + "Pour une recherche fiable et gratuite, ajoute la variable TAVILY_API_KEY (clé gratuite sur tavily.com).",
  );
}
