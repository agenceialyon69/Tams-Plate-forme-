import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileText, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth";

interface AuditLog {
  id: number;
  action: string;
  resource: string;
  resourceId: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  ip: string | null;
  createdAt: string;
}

const METHOD_COLORS: Record<string, string> = {
  POST: "bg-green-500/15 text-green-400 border-green-500/20",
  PATCH: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  PUT: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/20",
  GET: "bg-muted text-muted-foreground border-border",
};

const STATUS_COLOR = (code: number | null) => {
  if (!code) return "text-muted-foreground";
  if (code < 300) return "text-green-400";
  if (code < 400) return "text-yellow-400";
  if (code < 500) return "text-orange-400";
  return "text-red-400";
};

const RESOURCES = [
  "all", "captures", "tasks", "events", "learnings", "decisions",
  "memory", "recordings", "leads", "briefings", "ai",
];

export default function Audit() {
  const [resource, setResource] = useState("all");

  const { data: logs, isLoading, isError } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", resource],
    queryFn: () => apiFetch<AuditLog[]>(
      `/audit?limit=200${resource !== "all" ? `&resource=${resource}` : ""}`
    ),
    refetchInterval: 30_000,
  });

  function handleExport() {
    const token = getToken();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const url = `${base}/api/export`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "");
    if (token) {
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.blob())
        .then((blob) => {
          a.href = URL.createObjectURL(blob);
          a.click();
        });
    }
  }

  const grouped = (logs ?? []).reduce<Record<string, AuditLog[]>>((acc, log) => {
    const day = format(new Date(log.createdAt), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(log);
    return acc;
  }, {});

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto space-y-8">
      <PageHeader
        icon={FileText}
        title="Audit Trail"
        subtitle="Journal immuable de toutes les actions de modification."
        action={
          <div className="flex items-center gap-3">
            <Select value={resource} onValueChange={setResource}>
              <SelectTrigger className="w-40 bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === "all" ? "Tout" : r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export JSON
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/20 rounded-xl p-5">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <p className="text-destructive text-sm">Impossible de charger le journal d'audit.</p>
        </div>
      )}

      {!isLoading && !isError && logs?.length === 0 && (
        <div className="text-center py-20">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground italic">Aucune action enregistrée.</p>
          <p className="text-muted-foreground/60 text-sm mt-1">
            Les créations, modifications et suppressions apparaîtront ici.
          </p>
        </div>
      )}

      {!isLoading && logs && logs.length > 0 && (
        <div className="space-y-8">
          {Object.entries(grouped).map(([day, dayLogs]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {format(new Date(day), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {dayLogs.map((log, i) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors"
                      >
                        <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">
                          {format(new Date(log.createdAt), "HH:mm:ss")}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono w-14 justify-center shrink-0 ${METHOD_COLORS[log.method] ?? ""}`}
                        >
                          {log.method}
                        </Badge>
                        <span className="font-mono text-sm text-foreground/80 truncate flex-1">
                          {log.action}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          {log.path}
                        </span>
                        <span className={`text-xs font-mono shrink-0 ${STATUS_COLOR(log.statusCode)}`}>
                          {log.statusCode ?? "—"}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {logs && logs.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          {logs.length} entrées affichées · Journal non modifiable depuis l'UI
        </p>
      )}
    </div>
  );
}
