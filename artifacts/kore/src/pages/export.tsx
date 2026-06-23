import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  FileArchive,
  Database,
  BrainCircuit,
  Calendar,
  Shield,
  FileText,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  HardDrive,
} from "lucide-react";
import { getApiBase, apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ExportStatus {
  lastExport: string | null;
  tables: {
    name: string;
    count: number;
    icon: React.ElementType;
  }[];
}

const TABLE_ICONS: Record<string, React.ElementType> = {
  captures: Database,
  tasks: CheckCircle2,
  events: Calendar,
  learnings: BrainCircuit,
  decisions: FileText,
  memory: BrainCircuit,
  reviews: FileText,
  energy: HardDrive,
  audit: Shield,
};

async function fetchExportStatus(): Promise<ExportStatus> {
  const data = await apiFetch<{ counts: Record<string, number> }>("/export/status");
  const tables = Object.entries(data.counts || {}).map(([name, count]) => ({
    name,
    count,
    icon: TABLE_ICONS[name] || Database,
  }));
  return {
    lastExport: localStorage.getItem("tams_last_export"),
    tables,
  };
}

async function downloadExport(format: "json" | "zip" = "json"): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/export${format === "zip" ? "/zip" : ""}`, {
    headers: {
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
  });

  if (!res.ok) {
    throw new Error("Export failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tams-export-${new Date().toISOString().split("T")[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  localStorage.setItem("tams_last_export", new Date().toISOString());
}

export default function ExportPage() {
  const [downloading, setDownloading] = useState<"json" | "zip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["export-status"],
    queryFn: fetchExportStatus,
  });

  const handleDownload = async (format: "json" | "zip") => {
    setError(null);
    setDownloading(format);
    try {
      await downloadExport(format);
    } catch (err) {
      setError("Impossible de générer l'export. Réessaie.");
    } finally {
      setDownloading(null);
    }
  };

  const totalRecords = status?.tables.reduce((sum, t) => sum + t.count, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileArchive className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-semibold text-foreground">
                  Recovery & Export
                </h1>
                <p className="text-sm text-muted-foreground">
                  Sauvegarde et récupère toutes tes données TAMS
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Warning Banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5 flex gap-4 items-start">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-amber-500 font-semibold mb-1">
                Tes données sont précieuses
              </h3>
              <p className="text-sm text-amber-500/80 leading-relaxed">
                Exporte régulièrement tes données pour éviter toute perte. Les exports contiennent
                toutes tes captures, décisions, mémoire, événements et configurations.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Export Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                <Download className="w-5 h-5 text-primary" />
                Télécharger un export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                  onClick={() => handleDownload("json")}
                  disabled={downloading !== null}
                  variant="outline"
                  className="h-auto py-5 flex-col items-start gap-2"
                >
                  <div className="flex items-center gap-3 w-full">
                    {downloading === "json" ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <FileText className="w-5 h-5 text-primary" />
                    )}
                    <div className="text-left">
                      <span className="font-medium">Export JSON</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Format lisible, réimportable
                      </p>
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleDownload("zip")}
                  disabled={downloading === "zip"}
                  variant="outline"
                  className="h-auto py-5 flex-col items-start gap-2"
                >
                  <div className="flex items-center gap-3 w-full">
                    {downloading === "zip" ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <FileArchive className="w-5 h-5 text-primary" />
                    )}
                    <div className="text-left">
                      <span className="font-medium">Export ZIP complet</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Base + docs + config
                      </p>
                    </div>
                  </div>
                </Button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-lg">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {status?.lastExport && (
                <p className="text-xs text-muted-foreground">
                  Dernier export :{" "}
                  {format(new Date(status.lastExport), "'le' d MMMM 'à' HH:mm", { locale: fr })}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Data Overview */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-card border-border/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                  <Database className="w-5 h-5 text-muted-foreground" />
                  Aperçu des données
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Database className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {totalRecords.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    enregistrements au total
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {status?.tables.map((table) => (
                    <div
                      key={table.name}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center">
                        <table.icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize text-foreground">
                          {table.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {table.count.toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recovery Instructions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                <RefreshCw className="w-5 h-5 text-muted-foreground" />
                Procédure de restauration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    1
                  </span>
                  <div>
                    <p className="text-foreground font-medium">Télécharge l'export ZIP</p>
                    <p className="mt-1">
                      Le ZIP contient la base de données, la mémoire, les événements, les décisions,
                      les prompts et la configuration.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    2
                  </span>
                  <div>
                    <p className="text-foreground font-medium">Stocke l'export en lieu sûr</p>
                    <p className="mt-1">
                      Utilise un stockage chiffré (cloud sécurisé ou disque externe).
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    3
                  </span>
                  <div>
                    <p className="text-foreground font-medium">Pour restaurer</p>
                    <p className="mt-1">
                      Importe le JSON dans une nouvelle instance TAMS via l'API ou remplace
                      la base de données manuellement.
                    </p>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="text-xs text-muted-foreground/70 space-y-1">
            <p>
              Les exports contiennent des données sensibles. Ne les partage pas.
            </p>
            <p>
              Les secrets (clés API, tokens) ne sont jamais inclus dans les exports.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
