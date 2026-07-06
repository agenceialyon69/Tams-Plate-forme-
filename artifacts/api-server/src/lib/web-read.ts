/**
 * LIRE-URL — récupère une page web et la nettoie en texte lisible. Free-first,
 * sans clé. Anti-SSRF strict (jamais d'IP privée / metadata cloud).
 *
 * REGLE DE VERITE : jamais de faux contenu. Échec réseau => erreur claire.
 */
export const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo
export const MAX_TEXT_CHARS = 100_000;
const MAX_REDIRECTS = 3;

export class BlockedUrl extends Error {
  constructor(msg: string) { super(msg); this.name = "BlockedUrl"; }
}

/** Rejette localhost, IP privées/link-local, metadata cloud, hôtes mono-label. */
export function assertPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrl("URL invalide");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrl("Protocole non autorisé (http/https uniquement)");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new BlockedUrl("Hôte local interdit");
  }
  // IPv6 : ::1 (loopback), fc00::/7 (ULA), fe80::/10 (link-local).
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h) || h === "::") {
      throw new BlockedUrl("Adresse IPv6 privée interdite");
    }
  }
  // IPv4 littérale : plages privées / loopback / link-local / metadata.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) || // link-local + metadata 169.254.169.254
        a >= 224) {
      throw new BlockedUrl("Adresse IP privée/réservée interdite (anti-SSRF)");
    }
  }
  return u;
}

/** Extrait titre + texte principal d'un HTML (retire script/style/nav…). */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim()).slice(0, 300) : "";

  let body = html;
  // Contenu principal si <main>/<article> présent.
  const main = body.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main) body = main[2];

  body = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|li|h[1-6]|tr|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

function decodeEntities(s: string): string {
  return s
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

export interface WebPage { url: string; title: string; text: string; chars: number; truncated: boolean }

/** Récupère et nettoie une page. Suit les redirections en re-validant chaque saut. */
export async function readUrl(input: string): Promise<WebPage> {
  let target = assertPublicUrl(input);
  let res: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    res = await fetch(target.toString(), {
      redirect: "manual",
      headers: {
        "User-Agent": "TAMS-Agent/1.0 (+https://github.com/agenceialyon69/Tams-Plate-forme-)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      target = assertPublicUrl(new URL(loc, target).toString()); // re-valide (anti-SSRF via redirect)
      continue;
    }
    break;
  }
  if (!res) throw new Error("aucune réponse");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const ct = res.headers.get("content-type") || "";
  const clen = Number(res.headers.get("content-length") || 0);
  if (clen && clen > MAX_BYTES) throw new Error("page trop volumineuse (> 2 Mo)");

  // Lecture bornée du flux.
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
  const raw = Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf8");

  if (/text\/html|application\/xhtml/i.test(ct) || /<html[\s>]/i.test(raw)) {
    const { title, text } = htmlToText(raw);
    const truncated = text.length > MAX_TEXT_CHARS;
    return { url: target.toString(), title, text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, chars: text.length, truncated };
  }
  // Texte brut (ou autre) : renvoyer tel quel, borné.
  const text = raw.replace(/\r\n/g, "\n").trim();
  const truncated = text.length > MAX_TEXT_CHARS;
  return { url: target.toString(), title: "", text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, chars: text.length, truncated };
}

const URL_RE = /https?:\/\/[^\s<>"')]+/i;
export function findUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}
