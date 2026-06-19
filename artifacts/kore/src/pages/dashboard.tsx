import { useState, useEffect } from "react";
import {
  useGetMorningBriefing,
  useLogEnergyLevel,
  useListTasks,
  useUpdateTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Battery, ListTodo, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { format, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bonjour";
  if (h >= 12 && h < 18) return "Bon après-midi";
  if (h >= 18 && h < 22) return "Bonsoir";
  return "Bonne nuit";
}

export default function Dashboard() {
  const { data: briefing, isLoading } = useGetMorningBriefing();
  const { data: pendingTasks } = useListTasks({ status: "pending" });
  const logEnergy = useLogEnergyLevel();
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [hideEnergyWidget, setHideEnergyWidget] = useState(false);
  const [greeting] = useState(getTimeGreeting);

  useEffect(() => {
    const lastLogStr = localStorage.getItem("lastEnergyLogTime");
    if (lastLogStr) {
      const lastLog = parseInt(lastLogStr, 10);
      if (Date.now() - lastLog < 3_600_000) setHideEnergyWidget(true);
    }
  }, []);

  const handleEnergySelect = async (level: number) => {
    try {
      await logEnergy.mutateAsync({ data: { level, note: "Depuis le tableau de bord" } });
      localStorage.setItem("lastEnergyLogTime", Date.now().toString());
      setHideEnergyWidget(true);
      toast({ description: "Niveau d'énergie enregistré." });
    } catch {
      toast({ variant: "destructive", description: "Erreur lors de l'enregistrement." });
    }
  };

  const handleMarkTaskDone = async (id: number) => {
    try {
      await updateTask.mutateAsync({ id, data: { status: "done" } });
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      toast({ description: "Tâche terminée ✓" });
    } catch {
      toast({ variant: "destructive", description: "Erreur lors de la mise à jour." });
    }
  };

  const overdueTasks =
    pendingTasks?.filter((task) => {
      if (!task.dueDate) return false;
      return isBefore(startOfDay(new Date(task.dueDate)), startOfDay(new Date()));
    }) || [];

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const isOverloaded =
    briefing?.estimatedLoad === "critical" || briefing?.estimatedLoad === "heavy";
  const dateStr = format(new Date(), "EEEE d MMMM", { locale: fr });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const generatedAtStr = briefing?.generatedAt
    ? format(new Date(briefing.generatedAt), "HH:mm", { locale: fr })
    : null;

  const loadConfig: Record<string, { label: string; className: string }> = {
    light:    { label: "Charge légère",   className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    moderate: { label: "Charge modérée",  className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    heavy:    { label: "Charge élevée",   className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    critical: { label: "Charge critique", className: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const loadDisplay = briefing?.estimatedLoad ? loadConfig[briefing.estimatedLoad] : null;

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto space-y-10">
      <header>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-1">
            <p className="text-sm text-muted-foreground font-medium">{capitalizedDate}</p>
            {loadDisplay && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${loadDisplay.className}`}>
                <Zap className="w-3 h-3" />
                {loadDisplay.label}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-serif mb-2 text-foreground">{greeting}.</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {briefing?.tamsMessage ||
              "Prenons le temps de nous recentrer sur ce qui compte vraiment."}
          </p>
          {generatedAtStr && (
            <p className="text-xs text-muted-foreground/60 mt-2">
              Briefing généré à {generatedAtStr}
            </p>
          )}
        </motion.div>
      </header>

      {briefing?.overloadAlert && isOverloaded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 flex gap-4 items-start">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="text-destructive font-medium mb-1">Attention requise</h3>
              <p className="text-destructive/80 text-sm">{briefing.overloadAlert}</p>
            </div>
          </div>
        </motion.div>
      )}

      {!hideEnergyWidget && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card/50 border-card-border">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-5">
                <Battery className="w-4 h-4" />
                Comment tu te sens en ce moment ?
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Épuisé", level: 1 },
                  { label: "Fatigué", level: 3 },
                  { label: "Correct", level: 5 },
                  { label: "Bien", level: 7 },
                  { label: "En forme", level: 9 },
                ].map(({ label, level }) => (
                  <Button
                    key={level}
                    variant="outline"
                    size="sm"
                    onClick={() => handleEnergySelect(level)}
                    disabled={logEnergy.isPending}
                    className="rounded-full"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {overdueTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-xl text-amber-500">
                <ListTodo className="w-5 h-5" />
                En retard
                <span className="ml-auto text-sm font-sans font-normal bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
                  {overdueTasks.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {overdueTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-4 bg-background/50 p-3 rounded-lg border border-border/50"
                  >
                    <span className="text-foreground/90 font-medium truncate">{task.title}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 h-8 text-xs"
                      onClick={() => handleMarkTaskDone(task.id)}
                      disabled={updateTask.isPending}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Fait
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-card-border h-full shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-xl">
                <CheckCircle2 className="w-5 h-5 text-accent" />
                Priorités du jour
              </CardTitle>
            </CardHeader>
            <CardContent>
              {briefing?.topPriorities?.length ? (
                <ul className="space-y-4">
                  {briefing.topPriorities.map((priority, i) => (
                    <li key={i} className="flex gap-3 text-foreground/90">
                      <span className="text-accent text-sm mt-0.5 font-mono font-medium shrink-0">
                        {i + 1}.
                      </span>
                      <span className="leading-relaxed">{priority}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic text-sm">
                  Aucune priorité définie. Capture quelque chose pour commencer.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-card border-card-border h-full shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-xl">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Agenda du jour
              </CardTitle>
            </CardHeader>
            <CardContent>
              {briefing?.todayEvents?.length ? (
                <ul className="space-y-4">
                  {briefing.todayEvents.map((event) => (
                    <li key={event.id} className="flex gap-4">
                      <span className="text-muted-foreground text-sm w-12 shrink-0 font-mono">
                        {event.eventTime || "—"}
                      </span>
                      <span className="text-foreground/90 text-sm">{event.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic text-sm">
                  Aucun événement prévu. Ajoute-en via la Capture.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
