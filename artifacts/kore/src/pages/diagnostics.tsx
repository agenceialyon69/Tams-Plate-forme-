import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Database, Cpu, Wifi, Clock, Server, Key,
} from "lucide-react";

interface DiagCheck {
  status: "ok" | "warn" | "error";
  detail?: string;
  latencyMs?: number;
}

interface Diagnostics {
  overall: "ok" | "warn" | "error";
  checks: Record<string, DiagCheck>;
  latencyMs: number;
  timestamp: string;
  nodeVersion: string;
  dbStatus: string;
}

const STATUS_ICON = {
  ok: { Icon: CheckCircle2, color: "text-green-400" },
  warn: { Icon: AlertTriangle, color: "text-yellow-400" },
  error: { Icon: XCircle, color: "text-red-400" },
};

const CHECK_META: Record<string, { label: string; icon: typeof Database }> = {
  database: { label: "Base de données", icon: Database },
  gemini: { label: "Provider IA Gemini", icon: Cpu },
  groq: { label: "Provider Voix Groq", icon: Wifi },
  auth: { label: "Token d'authentification", icon: Key },
  environment: { label: "Environnement", icon: Server },
  memory: { label: "Mémoire serveur", icon: Cpu },
  uptime: { label: "Uptime serveur", icon: Clock },
};

function CheckRow({ name, check }: { name: string; check: DiagCheck }) {
  const { status, detail, latencyMs } = check;
  const { Icon, color } = STATUS_ICON[status];
  const meta = CHECK_META[name] ?? { label: name, icon: Server };
  const MetaIcon = meta.icon;

  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
      <MetaIcon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{meta.label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>}
      </div>
      {latencyMs !== undefined && (
        <span className="text-xs text-muted-foreground font-mono shrink-0">{latencyMs}ms</span>
      )}
      <Icon className={`w-5 h-5 shrink-0 ${color}`} />
    </div>
  );
}

export default function Diagnostics() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Diagnostics>({
    queryKey: ["diagnostics"],
    queryFn: () => apiFetch<Diagnostics>("/diagnostics"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const overallConfig = data ? STATUS_ICON[data.overall] : null;

  return (
    <div className="p-8 md:p-12 max-w-3xl mx-auto space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif mb-2 text-foreground">Diagnostics</h1>
          <p className="text-muted-foreground text-lg">
            État de santé du système en temps réel.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </header>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl p-5">
          <XCircle className="w-5 h-5 text-destructive" />
          <p className="text-destructive text-sm">Impossible de charger les diagnostics. L'API est peut-être indisponible.</p>
        </div>
      )}

      {data && !isLoading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Overall status */}
          {overallConfig && (
            <div className={`rounded-xl border p-5 flex items-center gap-4 ${
              data.overall === "ok"
                ? "bg-green-500/5 border-green-500/20"
                : data.overall === "error"
                ? "bg-red-500/5 border-red-500/20"
                : "bg-yellow-500/5 border-yellow-500/20"
            }`}>
              <overallConfig.Icon className={`w-7 h-7 shrink-0 ${overallConfig.color}`} />
              <div>
                <h2 className={`font-medium text-lg ${overallConfig.color}`}>
                  {data.overall === "ok" ? "Système opérationnel" : data.overall === "warn" ? "Avertissements détectés" : "Problèmes critiques"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  Vérifié en {data.latencyMs}ms · Node.js {data.nodeVersion}
                </p>
              </div>
            </div>
          )}

          {/* Checks */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-0">
              <CardTitle className="font-serif font-normal text-xl">Services</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <div>
                {Object.entries(data.checks).map(([name, check]) => (
                  <CheckRow key={name} name={name} check={check} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* PWA / install hint */}
          <Card className="bg-card border-border">
            <CardContent className="py-5 px-5 space-y-3">
              <h3 className="font-medium text-foreground text-sm">Application installable (PWA)</h3>
              <div className="space-y-1.5">
                {[
                  { check: typeof window !== "undefined" && "serviceWorker" in navigator, label: "Service Worker supporté" },
                  { check: typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches, label: "Installée en mode standalone" },
                  { check: typeof Notification !== "undefined" && Notification.permission === "granted", label: "Notifications autorisées" },
                ].map(({ check, label }) => {
                  const Icon = check ? CheckCircle2 : AlertTriangle;
                  const color = check ? "text-green-400" : "text-yellow-400/70";
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            Dernière vérification : {new Date(data.timestamp).toLocaleString("fr-FR")}
          </p>
        </motion.div>
      )}
    </div>
  );
}
