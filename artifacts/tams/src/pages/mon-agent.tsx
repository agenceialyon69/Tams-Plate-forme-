import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, ShieldCheck, ShieldAlert, ShieldX, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MON AGENT — cockpit minimal du Personal Operator (PR #1, issue #94).
 * Un seul agent, plusieurs modes internes. Chat control-plane branché sur
 * POST /api/operator/chat + cycle confirm/cancel pour les actions sensibles.
 * Volontairement simple : pas de refonte UI. Surfacé dans la navigation
 * principale (« Mon Agent ») comme l'unique agent capable de la plateforme.
 */

interface OperatorReply {
  message: string;
  intent: string;
  capabilityId: string | null;
  actionPlan: string[];
  requiresConfirmation: boolean;
  confirmationId: string | null;
  executionStatus: string;
  evidence: unknown[];
  warnings: string[];
  nextStep: string;
}

interface Capability {
  id: string;
  label: string;
  description: string;
  group: string;
  status: "available" | "configured" | "missing" | "disabled" | "future";
  freeFirst: boolean;
  riskLevel: string;
  requiresConfirmation: boolean;
  setupNeeded: string | null;
}

interface ReadinessCheck {
  id: string;
  verdict: "PASS" | "WARN" | "FAIL" | "FUTURE";
  cause?: string;
  nextAction?: string;
}

const PRODUCT_MESSAGE =
  "Je suis ton agent personnel privé. Je peux rechercher, analyser, organiser, coder, " +
  "travailler sur GitHub, lire tes fichiers, utiliser le Studio, préparer tes communications " +
  "et automatiser progressivement tes tâches. Je privilégie toujours le gratuit et je " +
  "t'indique honnêtement ce qui est connecté ou non.";

const STATUS_LABEL: Record<Capability["status"], string> = {
  available: "disponible",
  configured: "configuré",
  missing: "à connecter",
  disabled: "désactivé",
  future: "futur",
};

interface ChatEntry {
  role: "user" | "agent";
  text: string;
  reply?: OperatorReply;
}

const EXAMPLES = [
  "regarde le statut CI",
  "mes capacités",
  "analyse red team : lancer ma boutique TikTok",
  "ajoute une tâche : préparer la démo",
];

export default function MonAgent() {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [readiness, setReadiness] = useState<ReadinessCheck[]>([]);
  const [overall, setOverall] = useState<string>("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/operator/capabilities").then(r => r.ok ? r.json() : null)
      .then(d => d?.capabilities && setCaps(d.capabilities)).catch(() => {});
    fetch("/api/operator/readiness").then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.checks) { setReadiness(d.checks); setOverall(d.overall); } }).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries]);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    setEntries(prev => [...prev, { role: "user", text: message }]);
    try {
      const res = await fetch("/api/operator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEntries(prev => [...prev, { role: "agent", text: data.message, reply: data }]);
    } catch (err) {
      setEntries(prev => [...prev, { role: "agent", text: `Erreur: ${err instanceof Error ? err.message : "réseau"}` }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const decide = useCallback(async (confirmationId: string, action: "confirm" | "cancel") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId }),
      });
      const data = await res.json();
      const a = data?.action;
      setEntries(prev => [...prev, {
        role: "agent",
        text: action === "cancel"
          ? "Action annulée ✅"
          : a?.status === "completed"
            ? `Action exécutée ✅\n${JSON.stringify(a.result ?? {}, null, 2).slice(0, 400)}`
            : `Action ${a?.status ?? "inconnue"} — ${a?.error ?? data?.error ?? ""}`,
      }]);
    } catch (err) {
      setEntries(prev => [...prev, { role: "agent", text: `Erreur: ${err instanceof Error ? err.message : "réseau"}` }]);
    } finally {
      setBusy(false);
    }
  }, []);

  const verdictIcon = (v: string) =>
    v === "PASS" ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
      : v === "WARN" ? <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
        : v === "FUTURE" ? <ShieldAlert className="w-3.5 h-3.5 text-violet-400" />
          : <ShieldX className="w-3.5 h-3.5 text-red-400" />;

  const statusColor = (s: Capability["status"]) =>
    s === "available" || s === "configured" ? "bg-emerald-400"
      : s === "disabled" ? "bg-amber-400"
        : s === "future" ? "bg-violet-400" : "bg-red-400";

  const groups = caps.reduce<Record<string, Capability[]>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in pb-28 md:pb-6">
      <div className="px-4 pt-5 pb-3 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <Bot className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground tracking-tight truncate">Mon Agent</h1>
            <p className="text-[11px] text-muted-foreground truncate">Agent personnel privé · free-first · un agent, plusieurs modes</p>
          </div>
          {overall && (
            <span className={cn("ml-auto text-xs font-bold shrink-0", overall === "PASS" ? "text-emerald-400" : overall === "WARN" ? "text-amber-400" : "text-red-400")}>
              {overall}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Chat control-plane */}
        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Parle-moi comme à un opérateur : je route vers le bon mode (GitHub/CI, Red Team, tâches, mémoire, Studio…) et je demande confirmation avant toute action sensible.</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map(e => (
                  <button key={e} onClick={() => send(e)} className="px-2.5 py-1 rounded-full bg-secondary border border-border text-[11px] text-foreground active:scale-[0.98]">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          {entries.map((entry, i) => (
            <div key={i} className={cn("flex", entry.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                entry.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm border border-border/50",
              )}>
                {entry.text}
                {entry.reply && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[10px] text-muted-foreground">
                      mode: {entry.reply.intent}{entry.reply.capabilityId ? ` · ${entry.reply.capabilityId}` : ""} · {entry.reply.executionStatus}
                    </div>
                    {entry.reply.warnings.length > 0 && (
                      <div className="text-[10px] text-amber-400">{entry.reply.warnings.join(" · ")}</div>
                    )}
                    {entry.reply.requiresConfirmation && entry.reply.confirmationId && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => decide(entry.reply!.confirmationId!, "confirm")} disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-xs disabled:opacity-50">
                          <Check className="w-3 h-3" /> Confirmer
                        </button>
                        <button onClick={() => decide(entry.reply!.confirmationId!, "cancel")} disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-500/25 text-xs disabled:opacity-50">
                          <X className="w-3 h-3" /> Annuler
                        </button>
                      </div>
                    )}
                    {entry.reply.nextStep && (
                      <div className="text-[10px] text-muted-foreground/80">→ {entry.reply.nextStep}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <div ref={endRef} />
        </div>

        {/* Readiness */}
        {readiness.length > 0 && (
          <div className="bg-secondary/60 border border-border/50 rounded-xl p-3 space-y-1.5">
            <div className="text-xs font-semibold text-foreground">Readiness</div>
            {readiness.map(c => (
              <div key={c.id} className="flex items-start gap-2 text-[11px]">
                <span className="mt-0.5 shrink-0">{verdictIcon(c.verdict)}</span>
                <span className="text-foreground">{c.id}</span>
                {c.verdict !== "PASS" && <span className="text-muted-foreground">— {c.cause}{c.nextAction ? ` → ${c.nextAction}` : ""}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Capacités — carte MAXIMUM free-first, par groupes, statuts honnêtes */}
        {caps.length > 0 && (
          <div className="bg-secondary/60 border border-border/50 rounded-xl p-3 space-y-3">
            <div>
              <div className="text-xs font-semibold text-foreground mb-1">Voici ce que je peux faire</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{PRODUCT_MESSAGE}</p>
              <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-muted-foreground">
                <span>{caps.filter(c => c.status === "available" || c.status === "configured").length}/{caps.length} actives</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> dispo/configuré</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> à connecter</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> désactivé (garde-fou)</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> futur</span>
              </div>
            </div>
            {Object.entries(groups).map(([groupName, list]) => (
              <div key={groupName} className="space-y-1">
                <div className="text-[11px] font-semibold text-foreground flex items-center justify-between gap-2">
                  <span className="truncate">{groupName}</span>
                  <span className="text-[10px] text-muted-foreground font-normal shrink-0">
                    {list.filter(c => c.status === "available" || c.status === "configured").length}/{list.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {list.map(c => (
                    <div key={c.id} className="flex items-start gap-2 text-[11px] min-w-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-1", statusColor(c.status))} />
                      <div className="min-w-0">
                        <span className="text-foreground">{c.label}</span>
                        <span className="text-muted-foreground/70"> · {STATUS_LABEL[c.status]}</span>
                        {c.freeFirst === false && <span className="text-amber-400/80"> · payant → non activé</span>}
                        {c.requiresConfirmation && <span className="text-amber-400/80"> · confirmation</span>}
                        {(c.status === "missing" || c.status === "disabled") && c.setupNeeded && (
                          <div className="text-[10px] text-muted-foreground/80 truncate">→ {c.setupNeeded}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border bg-sidebar" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={busy ? "En cours…" : "Donne un objectif à ton agent…"}
            rows={1}
            enterKeyHint="send"
            className="flex-1 bg-secondary rounded-xl px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[40px] max-h-32 border border-border/50 focus:border-primary/30"
            style={{ fontSize: "16px" }}
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            aria-label="Envoyer"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 active:scale-[0.98]"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
