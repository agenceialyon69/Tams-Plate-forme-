import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const exec = promisify(execFile);

export interface AnalyzedFile {
  filename: string;
  mimetype: string;
  size: number;
  type: "image" | "pdf" | "video" | "audio" | "document" | "unknown";
  extractedText?: string;
  extractedMetadata?: {
    duration?: number;
    dimensions?: { width: number; height: number };
    format?: string;
    pageCount?: number;
  };
  thumbnail?: string;
  summary?: string;
  risks?: string[];
}

function detectType(mimetype: string): AnalyzedFile["type"] {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.includes("word") || mimetype.includes("document") || mimetype.includes("text")) return "document";
  return "unknown";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function analyzeFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string
): Promise<AnalyzedFile> {
  const size = buffer.length;
  const type = detectType(mimetype);

  const result: AnalyzedFile = {
    filename: originalname,
    mimetype,
    size,
    type,
  };

  if (type === "image") {
    result.extractedText = `[Image: ${originalname}, ${formatBytes(size)}]`;
    const risks: string[] = [];
    if (size > 10 * 1024 * 1024) risks.push("Fichier volumineux - vérifier le contenu sensible");
    result.risks = risks;
    return result;
  }

  if (type === "video") {
    try {
      const tmpPath = join(tmpdir(), `analyze-${randomUUID()}.tmp`);
      writeFileSync(tmpPath, buffer);

      const { stdout } = await exec("ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        tmpPath,
      ]);

      const probe = JSON.parse(stdout);
      const videoStream = probe.streams?.find((s: { codec_type?: string }) => s.codec_type === "video");
      const audioStream = probe.streams?.find((s: { codec_type?: string }) => s.codec_type === "audio");
      const duration = parseFloat(probe.format?.duration || "0");

      result.extractedMetadata = {
        duration,
        dimensions: videoStream ? { width: videoStream.width, height: videoStream.height } : undefined,
        format: probe.format?.format_long_name || probe.format?.format_name,
      };

      result.extractedText = `[Vidéo: ${originalname}, ${formatBytes(size)}, durée: ${Math.round(duration)}s`;
      if (videoStream) {
        result.extractedText += `, ${videoStream.width}x${videoStream.height}`;
      }
      if (audioStream) {
        result.extractedText += ", audio présent";
      }
      result.extractedText += "]";

      const risks: string[] = [];
      if (result.extractedMetadata.duration && result.extractedMetadata.duration > 300) {
        risks.push("Vidéo longue - transcription partielle recommandée");
      }
      if (!audioStream) {
        risks.push("Pas de piste audio");
      }
      result.risks = risks;

      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch (err) {
      result.extractedText = `[Vidéo: ${originalname}, ${formatBytes(size)} - analyse FFprobe non disponible]`;
    }
    return result;
  }

  if (type === "audio") {
    try {
      const tmpPath = join(tmpdir(), `analyze-${randomUUID()}.tmp`);
      writeFileSync(tmpPath, buffer);

      const { stdout } = await exec("ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        tmpPath,
      ]);

      const probe = JSON.parse(stdout);
      const duration = parseFloat(probe.format?.duration || "0");
      result.extractedMetadata = {
        duration,
        format: probe.format?.format_long_name || probe.format?.format_name,
      };

      result.extractedText = `[Audio: ${originalname}, ${formatBytes(size)}, durée: ${Math.round(duration)}s]`;

      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      result.extractedText = `[Audio: ${originalname}, ${formatBytes(size)}]`;
    }
    return result;
  }

  if (type === "pdf" || mimetype === "application/pdf") {
    result.extractedText = `[PDF: ${originalname}, ${formatBytes(size)}]`;
    const risks: string[] = [];
    if (size > 50 * 1024 * 1024) {
      risks.push("PDF volumineux - extraction texte limitée");
    }
    result.risks = risks;
    return result;
  }

  if (type === "document") {
    const text = buffer.toString("utf-8").slice(0, 5000);
    result.extractedText = `[Document: ${originalname}, ${formatBytes(size)}]\n${
      text.length > 100 ? text.slice(0, 2000) + "..." : text
    }`;
    return result;
  }

  result.extractedText = `[Fichier: ${originalname}, ${formatBytes(size)}, type: ${mimetype}]`;
  return result;
}

export function generateAuditprompt(files: AnalyzedFile[], context?: string): string {
  const fileDescriptions = files.map((f) =>
    `${f.filename} (${f.type}): ${f.extractedText}${
      f.risks?.length ? `\n  Risques: ${f.risks.join(", ")}` : ""
    }`
  ).join("\n\n");

  return `
Tu es un assistant Red Team qui analyse des documents pour identifier les risques, angles morts, conséquences potentielles et recommandations.

Fichiers à analyser:
${fileDescriptions}

${context ? `Contexte additionnel: ${context}` : ""}

Fournis une analyse structurée:

## Résumé
[Brève synthèse du contenu]

## Risques identifiés
- [Liste des risques potentiels]

## Angles morts
- [Ce qui pourrait être manqué ou sous-estimé]

## Conséquences possibles
- [Implications si ces informations sont utilisées/ignorées]

## Recommandations
- [Actions concrètes recommandées]

## Objections potentielles
- [Points de friction anticipés]

Sois direct, concret et orienté action. Ne pas inventer de contenu non présent dans les fichiers.
`;
}
