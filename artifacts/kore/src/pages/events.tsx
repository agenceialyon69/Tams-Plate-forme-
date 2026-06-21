import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface AppEvent {
  id: number;
  event: string;
  category: string;
  source: string;
  severity: string;
  metadata: Record<string, unknown> | null;
  userId: number | null;
  createdAt: string;
}

const SOURCES = ["", "front", "backend", "copilot", "jobs"];
const SEVERITIES = ["", "info", "warning", "critical"];

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  critical: "bg-destructive/15 text-destructive",
};

export default function EventsPage() {
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");

  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (severity) params.set("severity", severity);
  const qs = params.toString();

  const { data, isLoading, isFetching, refetch, error } = useQuery<{ events: AppEvent[] }>({
    queryKey: ["app-events", source, severity],
    queryFn: () => apiFetch<{ events: AppEvent[] }>(`/app-events${qs ? `?${qs}` : ""}`),
  });

  const events = data?.events ?? [];

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 pb-24 md:pb-8">
      <header className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-serif font-semibold text-foreground leading-none">Événements</h1>
          <p className="text-xs text-muted-foreground mt-1">Journal applicatif structuré (analytics)</p>
        </div>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground" title="Rafraîchir">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="text-sm">
          <span className="text-xs text-muted-foreground mr-2">Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="bg-background border border-border rounded-lg px-2 py-1 text-sm">
            {SOURCES.map((s) => <option key={s} value={s}>{s || "toutes"}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted-foreground mr-2">Gravité</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-background border border-border rounded-lg px-2 py-1 text-sm">
            {SEVERITIES.map((s) => <option key={s} value={s}>{s || "toutes"}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="text-sm text-destructive p-6">Lecture impossible (réservé owner/admin).</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Aucun événement pour ces filtres.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${SEVERITY_STYLE[e.severity] ?? "bg-muted text-muted-foreground"}`}>
                  {e.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{e.event}</span>
                    <span className="text-muted-foreground"> · {e.category} · {e.source}</span>
                  </p>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{JSON.stringify(e.metadata)}</p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
