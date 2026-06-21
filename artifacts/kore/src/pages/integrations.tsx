import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plug, Github, CheckCircle2, XCircle, ExternalLink, Loader2, GitFork, Star, Film } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface GithubViewer {
  login: string;
  name: string | null;
  publicRepos: number;
  privateRepos: number;
  avatarUrl: string;
  htmlUrl: string;
}
interface GithubStatus {
  configured: boolean;
  valid?: boolean;
  viewer?: GithubViewer;
  error?: string;
}
interface GithubRepo {
  fullName: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
  openIssues: number;
  language: string | null;
}

function GithubCard() {
  const status = useQuery<GithubStatus>({
    queryKey: ["github-status"],
    queryFn: () => apiFetch<GithubStatus>("/integrations/github/status"),
  });

  const connected = status.data?.configured && status.data?.valid !== false;

  const repos = useQuery<{ repos: GithubRepo[] }>({
    queryKey: ["github-repos"],
    queryFn: () => apiFetch<{ repos: GithubRepo[] }>("/integrations/github/repos"),
    enabled: Boolean(connected),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
          <Github className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground leading-none">GitHub</h2>
          <p className="text-xs text-muted-foreground mt-1">Dépôts, issues et création d'issues</p>
        </div>
        {status.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Connecté
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <XCircle className="w-4 h-4" /> Non connecté
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {!status.data?.configured && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Pour activer GitHub, ajoute un token d'accès personnel dans les variables d'environnement&nbsp;:</p>
            <code className="block text-xs bg-muted/50 rounded-md px-3 py-2 font-mono">GITHUB_TOKEN=ghp_…</code>
            <p className="text-xs">
              Crée un token sur{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-accent inline-flex items-center gap-0.5 hover:underline"
              >
                github.com/settings/tokens <ExternalLink className="w-3 h-3" />
              </a>{" "}
              (portées <span className="font-mono">repo</span> et <span className="font-mono">read:user</span>).
            </p>
          </div>
        )}

        {status.data?.configured && status.data?.valid === false && (
          <p className="text-sm text-destructive">{status.data.error ?? "Token GitHub invalide."}</p>
        )}

        {connected && status.data?.viewer && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={status.data.viewer.avatarUrl} alt="" className="w-9 h-9 rounded-full" />
              <div className="min-w-0">
                <a
                  href={status.data.viewer.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-foreground hover:underline inline-flex items-center gap-1"
                >
                  {status.data.viewer.name ?? status.data.viewer.login}
                  <span className="text-muted-foreground font-normal">@{status.data.viewer.login}</span>
                </a>
                <p className="text-xs text-muted-foreground">
                  {status.data.viewer.publicRepos} publics · {status.data.viewer.privateRepos} privés
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Dépôts récents
              </p>
              {repos.isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {repos.data && (
                <ul className="space-y-1.5">
                  {repos.data.repos.slice(0, 8).map((r) => (
                    <li key={r.fullName}>
                      <a
                        href={r.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 hover:bg-muted/40 transition-colors"
                      >
                        <GitFork className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground truncate flex-1">{r.fullName}</span>
                        {r.private && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">privé</span>
                        )}
                        {r.language && (
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">{r.language}</span>
                        )}
                        {r.openIssues > 0 && (
                          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                            <Star className="w-3 h-3" /> {r.openIssues}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {repos.error && <p className="text-xs text-destructive">Impossible de charger les dépôts.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FfmpegCard() {
  const status = useQuery<{ configured: boolean; version: string | null }>({
    queryKey: ["ffmpeg-status"],
    queryFn: () => apiFetch<{ configured: boolean; version: string | null }>("/integrations/ffmpeg/status"),
  });

  const available = status.data?.configured;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setResult(null);
    if (file.size > 24 * 1024 * 1024) {
      setErr("Fichier trop volumineux (max 24 Mo pour cette démo).");
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",").pop() ?? "");
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ transcript?: string; metadata?: { durationSec?: number | null } }>(
        "/integrations/ffmpeg/extract-audio?transcribe=1",
        { method: "POST", body: JSON.stringify({ mediaBase64: base64 }) }
      );
      const dur = res.metadata?.durationSec ? `${Math.round(res.metadata.durationSec)}s` : "";
      setResult(
        res.transcript
          ? res.transcript
          : `Audio extrait ${dur ? `(${dur}) ` : ""}— ajoute GROQ_API_KEY pour obtenir la transcription automatiquement.`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Échec du traitement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
          <Film className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground leading-none">FFmpeg</h2>
          <p className="text-xs text-muted-foreground mt-1">Traitement vidéo/audio (alternative libre à CapCut)</p>
        </div>
        {status.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : available ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Disponible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <XCircle className="w-4 h-4" /> Indisponible
          </span>
        )}
      </div>
      <div className="px-5 py-4 text-sm text-muted-foreground space-y-3">
        {available ? (
          <>
            <p>
              FFmpeg est installé{status.data?.version ? <> (version <span className="font-mono text-xs">{status.data.version.split(" ")[0]}</span>)</> : null}.
              Convertis une <strong>vidéo en texte</strong> : extraction audio + transcription.
            </p>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/40 hover:bg-muted/40 transition-colors cursor-pointer text-sm text-foreground">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
              {busy ? "Traitement…" : "Choisir une vidéo/audio"}
              <input type="file" accept="video/*,audio/*" className="hidden" onChange={handleFile} disabled={busy} />
            </label>
            {result && (
              <div className="text-sm text-foreground bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {result}
              </div>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
          </>
        ) : (
          <p>
            FFmpeg n'est pas encore disponible dans l'environnement. Il est installé automatiquement
            au déploiement (Railway) ; aucune variable ni compte requis.
          </p>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-8">
      <header className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <Plug className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-serif font-semibold text-foreground leading-none">Intégrations</h1>
          <p className="text-xs text-muted-foreground mt-1">Connecte tes outils externes (gratuits)</p>
        </div>
      </header>

      <div className="space-y-4">
        <GithubCard />
        <FfmpegCard />
      </div>
    </div>
  );
}
