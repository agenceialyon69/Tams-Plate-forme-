import { Activity, AlertTriangle, TrendingUp, Zap, Clock, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const STATS = [
  { label: "Actions IA (24h)", value: "47", sub: "+12% vs hier", trend: "up", icon: Zap, color: "text-violet-500" },
  { label: "Erreurs (24h)", value: "3", sub: "0 critique", trend: "neutral", icon: AlertTriangle, color: "text-amber-500" },
  { label: "Latence moyenne", value: "1.2s", sub: "IA : 2.4s", trend: "neutral", icon: Clock, color: "text-blue-500" },
  { label: "Approbations", value: "2/5", sub: "3 en attente", trend: "neutral", icon: CheckCircle2, color: "text-green-500" },
  { label: "Rejets", value: "1", sub: "Red Team test", trend: "neutral", icon: XCircle, color: "text-red-500" },
  { label: "Rollbacks", value: "0", sub: "Aucun ce mois", trend: "neutral", icon: RefreshCw, color: "text-teal-500" },
];

const PROVIDERS = [
  { name: "Google Gemini", status: "operational", latency: "1.8s", calls: 34, errors: 1 },
  { name: "Groq Whisper", status: "operational", latency: "0.9s", calls: 13, errors: 0 },
];

const RECENT_EVENTS = [
  { time: "14:32", type: "ai", msg: "Scoring IA — 12 opportunités scorées", status: "ok" },
  { time: "14:18", msg: "Export CSV refusé — permissions insuffisantes", type: "security", status: "blocked" },
  { time: "13:55", msg: "Capture voix — réunion transcrite (38 min)", type: "capture", status: "ok" },
  { time: "13:42", msg: "Latence élevée Gemini — 4.1s (seuil : 3s)", type: "alert", status: "warn" },
  { time: "12:10", msg: "Utilisateur alice@example.com connecté", type: "auth", status: "ok" },
  { time: "11:45", msg: "Politique mise à jour — Export Requires Role v1.1", type: "policy", status: "ok" },
  { time: "10:30", msg: "Red Team test — prompt injection détectée et bloquée", type: "security", status: "ok" },
];

const STATUS_COLOR: Record<string, string> = {
  ok: "bg-green-500",
  warn: "bg-amber-400",
  blocked: "bg-red-500",
  error: "bg-red-600",
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  ai: "text-violet-500",
  security: "text-red-500",
  capture: "text-blue-500",
  alert: "text-amber-500",
  auth: "text-green-500",
  policy: "text-teal-500",
};

export default function Observability() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-serif font-semibold">Observabilité</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Vue santé globale — erreurs, latence, coûts IA, actions sensibles, approbations, activité par tenant.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {STATS.map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold mt-1">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                </div>
                <s.icon className={`w-5 h-5 mt-0.5 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">État des providers IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {PROVIDERS.map((p) => (
              <div key={p.name} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.status === "operational" ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{p.calls} appels</span>
                  <span>{p.latency}</span>
                  {p.errors > 0 && <span className="text-red-500">{p.errors} err.</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Flux d'activité récent</CardTitle>
            <CardDescription className="text-xs">Dernières 24h</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {RECENT_EVENTS.map((ev, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <span className="text-muted-foreground shrink-0 font-mono w-10">{ev.time}</span>
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${STATUS_COLOR[ev.status] ?? "bg-gray-300"}`} />
                  <span className={`${EVENT_TYPE_COLOR[ev.type] ?? ""} shrink-0 font-medium`}>
                    [{ev.type}]
                  </span>
                  <span className="text-muted-foreground">{ev.msg}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Alertes actives</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-amber-700 dark:text-amber-400">Latence élevée détectée</p>
              <p className="text-amber-600/80 dark:text-amber-500/80">Google Gemini a dépassé le seuil de 3s à 13h42. Surveiller.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
