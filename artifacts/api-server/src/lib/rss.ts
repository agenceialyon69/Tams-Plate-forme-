/**
 * VEILLE RSS/Atom — free-first, sans clé, sans dépendance.
 * Récupère un flux, en extrait les derniers items (titre, lien, date, résumé).
 * Anti-SSRF réutilisé (assertPublicUrl). Jamais de faux contenu.
 */
import { assertPublicUrl, BlockedUrl } from "./web-read.js";

export { BlockedUrl };

const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo
const MAX_ITEMS = 15;

export interface FeedItem { title: string; link: string; date: string; summary: string }
export interface Feed { title: string; url: string; items: FeedItem[] }

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .split("&nbsp;").join(" ")
    .split("&amp;").join("&")
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&quot;").join('"')
    .split("&#39;").join("'")
    .split("&apos;").join("'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ""; } });
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function link(block: string): string {
  // RSS : <link>url</link> ; Atom : <link href="url" />
  const rss = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim()) return decodeEntities(rss[1].trim());
  const atom = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return atom ? decodeEntities(atom[1]) : "";
}

/** Parse un XML RSS ou Atom en items bornés. */
export function parseFeed(xml: string, url: string): Feed {
  const feedTitle = tag(xml, "title") || "Flux";
  const blocks: string[] = [];
  const itemRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && blocks.length < MAX_ITEMS) blocks.push(m[0]);
  const items: FeedItem[] = blocks.map(b => ({
    title: tag(b, "title") || "(sans titre)",
    link: link(b),
    date: tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || "",
    summary: (tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 400),
  }));
  return { title: feedTitle, url, items };
}

/** Récupère et parse un flux (borné, anti-SSRF, timeout). */
export async function fetchFeed(input: string): Promise<Feed> {
  const target = assertPublicUrl(input);
  const res = await fetch(target.toString(), {
    redirect: "follow",
    headers: { "User-Agent": "TAMS-Agent/1.0 (+veille)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > MAX_BYTES) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
  }
  const xml = Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf8");
  if (!/<(rss|feed|rdf)\b/i.test(xml) && !/<item\b|<entry\b/i.test(xml)) {
    throw new Error("Ce n'est pas un flux RSS/Atom valide.");
  }
  return parseFeed(xml, target.toString());
}

/** Digest multi-flux : agrège les items récents en texte lisible. */
export async function fetchDigest(urls: string[]): Promise<{ text: string; feeds: Feed[] }> {
  const feeds: Feed[] = [];
  for (const u of urls.slice(0, 8)) {
    try { feeds.push(await fetchFeed(u)); } catch { /* un flux en échec n'arrête pas le digest */ }
  }
  const lines: string[] = ["VEILLE — digest des flux suivis", ""];
  for (const f of feeds) {
    lines.push(`## ${f.title}`);
    for (const it of f.items.slice(0, 5)) {
      lines.push(`- ${it.title}${it.date ? ` (${it.date})` : ""}${it.link ? `\n  ${it.link}` : ""}`);
    }
    lines.push("");
  }
  if (feeds.length === 0) lines.push("Aucun flux lisible (vérifie les URLs).");
  return { text: lines.join("\n"), feeds };
}
