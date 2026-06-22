import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  ShieldAlert, ShieldCheck, ShieldX, Play, RefreshCw,
  AlertTriangle, CheckCircle2, Info, Swords,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

interface RedTeamTest {
  id: string;
  name: string;
  category: "injection" | "auth" | "data-leak" | "robustness" | "rate-limit";
  description: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
}

interface RedTeamResult {
  results: RedTeamTest[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    warn: number;
    skip: number;
    critical: number;
  };
  runAt: string;
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, label: "Passé", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  fail: { icon: ShieldX, label: "Échec", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  warn: { icon: AlertTriangle, label: "Avertissement", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  skip: { icon: Info, label: "Ignoré", color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

const SEVERITY_CONFIG = {
  critical: { label: "Critique", color: "bg-red-600/20 text-red-400 border-red-600/30" },
  high: { label: "Élevé", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  medium: { label: "Moyen", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  low: { label: "Faible", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  info: { label: "Info", color: "bg-muted text-muted-foreground border-border" },
};

const CATEGORY_LABELS: Record<string, string> = {
  injection: "Injection",
  auth: "Authentification",
  "data-leak": "Fuite de données",
  robustness: "Robustesse",
  "rate-limit": "Rate limit",
};

export default function RedTeam() {
  const [result, setResult] = useState<RedTeamResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTests() {
    setIsRunning(true);
    setError(null);
    try {
      const data = await apiFetch<RedTeamResult>("/red-team/run", { method: "POST" });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'exécution des tests");
    } finally {
      setIsRunning(false);
    }
  }

  const overallOk = result && result.summary.fail === 0 && result.summary.critical === 0;

  const byCategory = result
    ? result.results.reduce<Record<string, RedTeamTest[]>>((acc, t) => {
        const cat = t.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(t);
        return acc;
      }, {})
    : {};

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto space-y-8">
      <PageHeader
        icon={Swords}
        title="Mode Red Team"
        subtitle="Tests de sécurité actifs — injections, auth bypass, fuites de données, robustesse."
        action={
          <Button
            onClick={runTests}
            disabled={isRunning}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Tests en cours…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Lancer les tests
              </>
            )}
          </Button>
        }
      />

      {!result && !isRunning && !error && (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center space-y-4">
            <ShieldAlert className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground font-medium">Aucun test exécuté</p>
            <p className="text-muted-foreground/60 text-sm max-w-md mx-auto">
              Le mode Red Team exécute des tests de sécurité réels sur l'API : injections,
              authentification, fuites de données et robustesse. Les tests s'exécutent
              en isolation et n'affectent pas les données existantes.
            </p>
            <Button
              onClick={runTests}
              variant="outline"
              className="gap-2 mt-4"
            >
              <Play className="w-4 h-4" />
              Lancer l'analyse
            </Button>
          </CardContent>
        </Card>
      )}

      {isRunning && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="py-4 px-5 flex items-center gap-4">
                <Skeleton className="w-20 h-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="w-16 h-6 rounded-full" />
              </CardContent>
            </Card>
          ))}
          <p className="text-center text-sm text-muted-foreground animate-pulse pt-2">
            Exécution des tests de sécurité…
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl p-5">
          <ShieldX className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-destructive font-medium">Erreur lors de l'exécution</p>
            <p className="text-destructive/80 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {result && !isRunning && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Summary */}
          <div className={`rounded-xl border p-5 ${overallOk ? "bg-green-500/5 border-green-500/20" : result.summary.critical > 0 ? "bg-red-500/5 border-red-500/20" : "bg-yellow-500/5 border-yellow-500/20"}`}>
            <div className="flex items-start gap-4">
              {overallOk
                ? <ShieldCheck className="w-6 h-6 text-green-400 shrink-0 mt-0.5" />
                : result.summary.critical > 0
                ? <ShieldX className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                : <ShieldAlert className="w-6 h-6 text-yellow-400 shrink-0 mt-0.5" />
              }
              <div className="flex-1">
                <h2 className={`font-medium ${overallOk ? "text-green-400" : result.summary.critical > 0 ? "text-red-400" : "text-yellow-400"}`}>
                  {overallOk
                    ? "Tous les tests passés"
                    : result.summary.critical > 0
                    ? `${result.summary.critical} problème(s) critique(s) détecté(s)`
                    : `${result.summary.warn} avertissement(s) — aucun échec critique`}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {result.summary.total} tests · {result.summary.pass} passés · {result.summary.fail} échecs · {result.summary.warn} avertissements
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Passés", value: result.summary.pass, color: "text-green-400" },
                  { label: "Échecs", value: result.summary.fail, color: "text-red-400" },
                  { label: "Warns", value: result.summary.warn, color: "text-yellow-400" },
                ].map((s) => (
                  <div key={s.label} className="bg-background/40 rounded-lg px-3 py-2">
                    <p className={`text-xl font-mono font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Results by category */}
          {Object.entries(byCategory).map(([category, tests]) => (
            <div key={category}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {CATEGORY_LABELS[category] ?? category}
              </p>
              <div className="space-y-2">
                {tests.map((test, i) => {
                  const st = STATUS_CONFIG[test.status];
                  const sv = SEVERITY_CONFIG[test.severity];
                  const Icon = st.icon;
                  return (
                    <motion.div
                      key={test.id}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Card className={`border ${st.bg}`}>
                        <CardContent className="py-4 px-5">
                          <div className="flex items-start gap-4">
                            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${st.color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-foreground text-sm">{test.name}</span>
                                <Badge variant="outline" className={`text-[10px] ${sv.color}`}>
                                  {sv.label}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{test.detail}</p>
                            </div>
                            <Badge variant="outline" className={`text-xs shrink-0 ${st.color} border-current/20`}>
                              {st.label}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground text-center pt-2">
            Exécuté le {new Date(result.runAt).toLocaleString("fr-FR")} · Données de test non persistées
          </p>
        </motion.div>
      )}
    </div>
  );
}
