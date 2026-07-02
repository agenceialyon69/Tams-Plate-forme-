import { useEffect, useState } from "react";
import { Bot, Plug, Shield, TerminalSquare } from "lucide-react";

type Status = { version: string; verdict: string; reason: string; capabilities: Record<string, string> };
type Plugin = { id: string; status: string; riskLevel: string };

type SubAgent = { id: string; name: string; scope: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export default function DevAgentPro() {
  const [status, setStatus] = useState<Status | null>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getJson<Status>("/api/dev-agent/pro/status"),
      getJson<{ plugins: Plugin[] }>("/api/dev-agent/pro/plugins"),
      getJson<{ subAgents: SubAgent[] }>("/api/dev-agent/pro/subagents"),
    ]).then(([s, p, a]) => {
      setStatus(s);
      setPlugins(p.plugins);
      setSubAgents(a.subAgents);
    }).catch(err => setError(err instanceof Error ? err.message : "Dev Agent Pro indisponible"));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-28 md:pb-10 space-y-5">
        <header className="rounded-3xl border border-primary/20 bg-card p-5">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">Dev Agent Pro v5</p>
              <h1 className="text-3xl font-semibold">Agent développeur contrôlé</h1>
              <p className="text-sm text-muted-foreground mt-1">Sandbox terminal safe, repo intelligence, diff preview, benchmark, plugins et repair contrôlé.</p>
            </div>
          </div>
          {status && <div className="mt-4 rounded-2xl bg-secondary/40 p-4 text-sm"><strong>Verdict {status.verdict}</strong> — {status.reason}</div>}
          {error && <div className="mt-4 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>}
        </header>

        <section className="grid gap-3 md:grid-cols-2">
          {Object.entries(status?.capabilities ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /><span className="font-medium">{key}</span></div>
              <p className="text-sm text-muted-foreground mt-2">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3"><Plug className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">Plugins</h2></div>
          <div className="grid gap-2 md:grid-cols-2">{plugins.map(p => <div key={p.id} className="rounded-xl bg-secondary/40 p-3 text-sm"><strong>{p.id}</strong> — {p.status} · {p.riskLevel}</div>)}</div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3"><TerminalSquare className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">Sous-agents</h2></div>
          <div className="grid gap-2 md:grid-cols-2">{subAgents.map(a => <div key={a.id} className="rounded-xl bg-secondary/40 p-3 text-sm"><strong>{a.name}</strong><p className="text-xs text-muted-foreground">{a.scope}</p></div>)}</div>
        </section>
      </div>
    </div>
  );
}
