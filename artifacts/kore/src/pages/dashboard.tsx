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
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Battery,
  ListTodo,
  Zap,
  Sparkles,
  Wand2,
  Plug,
  BrainCircuit,
  Activity,
  Users,
  ArrowRight,
  Mic,
  Compass,
  Shield,
  FileText,
  Archive,
  Download,
} from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format, isBefore, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const MAIN_ACTIONS = [
  {
    href: "/copilot",
    title: "Capturer",
    desc: "Note une idée, une tâche ou un rappel",
    icon: Mic,
    color: "bg-cyan-500",
    gradient: "from-cyan-500/20 to-transparent",
  },
  {
    href: "/memory",
    title: "Consulter",
    desc: "Accède à ta mémoire et tes connaissances",
    icon: BrainCircuit,
    color: "bg-amber-500",
    gradient: "from-amber-500/20 to-transparent",
  },
  {
    href: "/decisions",
    title: "Décider",
    desc: "Prends des décisions documentées",
    icon: Compass,
    color: "bg-emerald-500",
    gradient: "from-emerald-500/20 to-transparent",
  },
  {
    href: "/export",
    title: "Récupérer",
    desc: "Exporte toutes tes données",
    icon: Download,
    color: "bg-violet-500",
    gradient: "from-violet-500/20 to-transparent",
  },
];

const MODULES = [
  {
    section: "Assistant IA",
    items: [
      { href: "/copilot", title: "Copilot", desc: "Chat IA multi-modèles", icon: Sparkles },
      { href: "/studio", title: "Studio", desc: "Création vidéo & image", icon: Wand2, featured: true },
    ],
  },
  {
    section: "Gestion",
    items: [
      { href: "/tasks", title: "Tâches", desc: "Ta liste d'actions", icon: CheckCircle2 },
      { href: "/prospects", title: "Prospection", desc: "Leads scorés par IA", icon: Users },
    ],
  },
  {
    section: "Introspection",
    items: [
      { href: "/memory", title: "Mémoire", desc: "Connaissances long terme", icon: BrainCircuit },
      { href: "/decisions", title: "Décisions", desc: "Journal de décisions", icon: Compass },
    ],
  },
  {
    section: "Gouvernance",
    items: [
      { href: "/audit", title: "Audit Trail", desc: "Traçabilité complète", icon: FileText },
      { href: "/red-team", title: "Red Team", desc: "Analyse de risques", icon: Shield },
      { href: "/events", title: "Événements", desc: "Observabilité", icon: Activity },
    ],
  },
];

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bonjour";
  if (h >= 12 && h < 18) return "Bon après-midi";
  if (h >= 18 && h < 22) return "Bonsoir";
  return "Bonne nuit";
}

function ActionCard({
  action,
  index,
}: {
  action: (typeof MAIN_ACTIONS)[0];
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08 }}
    >
      <Link
        href={action.href}
        className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 hover:border-primary/30 transition-all duration-300 block"
      >
        <div
          className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
        />
        <div className="relative">
          <div
            className={`w-12 h-12 rounded-2xl ${action.color} flex items-center justify-center mb-4 shadow-lg`}
          >
            <action.icon className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {action.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {action.desc}
          </p>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-primary opacity-60 group-hover:opacity-100 transition-opacity">
            <span>Accéder</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function ModuleSection({
  section,
  items,
}: {
  section: string;
  items: (typeof MODULES)[0]["items"];
}) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-3 px-1">
        {section}
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card/50 hover:bg-card hover:border-border transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{item.title}</span>
                {item.featured && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                    PRO
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{item.desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </Link>
        ))}
      </div>
    </section>
  );
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
      await logEnergy.mutateAsync({
        data: { level, note: "Depuis le tableau de bord" },
      });
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
      toast({ description: "Tâche terminée" });
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
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
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
    light: {
      label: "Charge légère",
      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    moderate: {
      label: "Charge modérée",
      className: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    },
    heavy: {
      label: "Charge élevée",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    },
    critical: {
      label: "Charge critique",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
  };
  const loadDisplay = briefing?.estimatedLoad
    ? loadConfig[briefing.estimatedLoad]
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative overflow-hidden border-b border-border/40"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-accent/5 rounded-full blur-2xl" />

        <div className="relative max-w-6xl mx-auto px-8 py-12 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {capitalizedDate}
              </span>
              {loadDisplay && (
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${loadDisplay.className}`}
                >
                  <Zap className="w-3 h-3" />
                  {loadDisplay.label}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-serif font-semibold text-foreground mb-3">
              {greeting}.
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              {briefing?.tamsMessage ||
                "Prêt à capturer, décider et avancer sur ce qui compte vraiment."}
            </p>

            {generatedAtStr && (
              <p className="text-xs text-muted-foreground/50 mt-2">
                Briefing généré à {generatedAtStr}
              </p>
            )}
          </motion.div>
        </div>
      </motion.section>

      {/* Main Actions */}
      <section className="max-w-6xl mx-auto px-8 py-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-6">
          Actions rapides
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {MAIN_ACTIONS.map((action, i) => (
            <ActionCard key={action.href} action={action} index={i} />
          ))}
        </div>
      </section>

      {/* Alerts & Widgets */}
      {briefing?.overloadAlert && isOverloaded && (
        <section className="max-w-6xl mx-auto px-8 pb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="bg-destructive/8 border border-destructive/20 rounded-2xl p-5 flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-destructive font-semibold mb-1">Attention requise</h3>
                <p className="text-destructive/80 text-sm leading-relaxed">
                  {briefing.overloadAlert}
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      )}

      {!hideEnergyWidget && (
        <section className="max-w-6xl mx-auto px-8 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-card/50 border-border/40">
              <CardContent className="p-5">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-4">
                  <Battery className="w-4 h-4" />
                  Comment te sens-tu en ce moment ?
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
                      className="rounded-full border-border/50 hover:border-primary/40"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      )}

      {overdueTasks.length > 0 && (
        <section className="max-w-6xl mx-auto px-8 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card className="bg-amber-500/5 border-amber-500/15">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg text-amber-500">
                  <ListTodo className="w-5 h-5" />
                  Tâches en retard
                  <span className="ml-auto text-xs font-sans font-medium bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full">
                    {overdueTasks.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {overdueTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-4 bg-background/80 p-3.5 rounded-xl border border-border/40"
                    >
                      <span className="text-foreground/90 font-medium truncate">
                        {task.title}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-8 text-xs hover:bg-emerald-500/10 hover:text-emerald-500"
                        onClick={() => handleMarkTaskDone(task.id)}
                        disabled={updateTask.isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Fait
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      )}

      {/* Priorities & Agenda */}
      <section className="max-w-6xl mx-auto px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-card border-border/40 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  Priorités du jour
                </CardTitle>
              </CardHeader>
              <CardContent>
                {briefing?.topPriorities?.length ? (
                  <ul className="space-y-3.5">
                    {briefing.topPriorities.map((priority, i) => (
                      <li key={i} className="flex gap-3 text-foreground/85">
                        <span className="text-primary font-mono font-medium text-sm shrink-0 mt-0.5">
                          {i + 1}.
                        </span>
                        <span className="leading-relaxed">{priority}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Aucune priorité définie. Capture une idée pour commencer.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="bg-card border-border/40 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  Agenda du jour
                </CardTitle>
              </CardHeader>
              <CardContent>
                {briefing?.todayEvents?.length ? (
                  <ul className="space-y-3">
                    {briefing.todayEvents.map((event) => (
                      <li key={event.id} className="flex gap-4 items-start">
                        <span className="text-muted-foreground text-sm w-14 shrink-0 font-mono">
                          {event.eventTime || "—"}
                        </span>
                        <span className="text-foreground/85 text-sm">
                          {event.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Aucun événement prévu. Ajoute-en via la Capture.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Modules Grid */}
      <section className="max-w-6xl mx-auto px-8 pb-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-6">
          Tous les modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {MODULES.map((mod) => (
            <ModuleSection key={mod.section} section={mod.section} items={mod.items} />
          ))}
        </div>
      </section>
    </div>
  );
}
