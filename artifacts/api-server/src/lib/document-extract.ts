/**
 * Extraction de texte de documents — LOCALE, GRATUITE, sans dépendance native.
 *
 * Formats : txt / csv / md / json / log / tsv (direct), docx (ZIP + inflate,
 * pur Node), pdf (best-effort : inflate des flux FlateDecode + extraction Tj).
 *
 * REGLE DE VERITE : jamais de faux texte. Si l'extraction ne donne rien
 * d'exploitable (ex. PDF scanne), on le DIT — on n'invente pas de contenu.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

export const MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8 Mo
export const MAX_TEXT_CHARS = 100_000;

export class UnsupportedDocument extends Error {
  constructor(fileExt: string) {
    super(`Type de document non supporte : ${fileExt || "inconnu"} (supportes : txt, csv, md, json, docx, pdf)`);
    this.name = "UnsupportedDocument";
  }
}

export interface Extraction {
  type: string;
  chars: number;
  truncated: boolean;
  text: string;
  note?: string;
}

function fileExtOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function decodeEntities(s: string): string {
  return s
    .split("&amp;").join("&")
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&quot;").join('"')
    .split("&apos;").join("'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function normalizeNewlines(s: string): string {
  return s.split("\r\n").join("\n").split("\r").join("\n");
}

function cap(text: string, type: string, note?: string): Extraction {
  const truncated = text.length > MAX_TEXT_CHARS;
  return { type, chars: text.length, truncated, text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, note };
}

// DOCX : lecture ZIP (central directory) de word/document.xml
function readZipEntry(buf: Buffer, name: string): Buffer | null {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const cdCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < cdCount; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (entryName === name) {
      if (buf.readUInt32LE(localOff) !== 0x04034b50) return null;
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function extractDocx(buf: Buffer): Extraction {
  let xmlBuf: Buffer | null = null;
  try {
    xmlBuf = readZipEntry(buf, "word/document.xml");
  } catch {
    xmlBuf = null;
  }
  if (!xmlBuf) return cap("", "docx", "Impossible de lire word/document.xml (docx invalide ?).");
  let xml = xmlBuf.toString("utf8");
  xml = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "");
  const text = decodeEntities(xml).replace(/\n{3,}/g, "\n\n").trim();
  return cap(text, "docx", text.length < 3 ? "Document vide ou non extractible." : undefined);
}

// PDF : best-effort (flux FlateDecode + operateurs texte)
function unescapePdf(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => {
    switch (c) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      case "(": return "(";
      case ")": return ")";
      case "\\": return "\\";
      default: return String.fromCharCode(parseInt(c, 8));
    }
  });
}

function textFromPdfContent(content: string): string {
  let out = "";
  const re = /\((?:[^()\\]|\\.)*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    out += unescapePdf(m[0].slice(1, -1));
  }
  return out;
}

function extractPdf(buf: Buffer): Extraction {
  const latin = buf.toString("latin1");
  let collected = "";
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = streamRe.exec(latin)) !== null && count < 200) {
    count++;
    const raw = Buffer.from(m[1], "latin1");
    let text = "";
    try {
      text = textFromPdfContent(inflateSync(raw).toString("latin1"));
    } catch {
      text = textFromPdfContent(m[1]);
    }
    if (text) collected += text + "\n";
    if (collected.length > MAX_TEXT_CHARS) break;
  }
  const text = normalizeNewlines(collected).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.replace(/\s/g, "").length < 20) {
    return cap("", "pdf", "PDF probablement scanne ou non extractible en texte. Colle le texte, ou fournis un PDF texte (pas une image).");
  }
  return cap(text, "pdf", "Extraction best-effort (mise en page non preservee).");
}

/** Extrait le texte d'un document. Leve UnsupportedDocument pour un type inconnu. */
export function extractText(filename: string, buf: Buffer): Extraction {
  if (buf.length === 0) throw new Error("document vide");
  if (buf.length > MAX_INPUT_BYTES) throw new Error(`document trop volumineux (> ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)} Mo)`);
  const e = fileExtOf(filename);
  switch (e) {
    case "txt":
    case "csv":
    case "md":
    case "markdown":
    case "log":
    case "tsv":
    case "json": {
      const text = normalizeNewlines(buf.toString("utf8")).trim();
      return cap(text, e, text.length < 1 ? "Fichier vide." : undefined);
    }
    case "docx":
      return extractDocx(buf);
    case "pdf":
      return extractPdf(buf);
    default:
      if (buf.subarray(0, 4).toString("latin1") === "%PDF") return extractPdf(buf);
      if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return extractDocx(buf);
      throw new UnsupportedDocument(e);
  }
}
