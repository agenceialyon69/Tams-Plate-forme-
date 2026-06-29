import { useState, useMemo, useEffect } from "react";
import type { Task, Decision, ActivityItem } from "@workspace/api-client-react";
import {
  useGetTodayBriefing, useGenerateBriefing, useGetDashboardSummary, useGetWorkload, useGetRecentActivity,
  useListTasks, useListDecisions, useUpdateTask, useUpdateDecision,
  getGetTodayBriefingQueryKey, getListTasksQueryKey, getListDecisionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, TrendingUp, Zap, Star, RefreshCw, CheckSquare, FolderOpen, Users, Brain,
  ArrowRight, Clock, ShieldAlert, AlertCircle, CheckCircle2, Lightbulb, ChevronRight,
  Ban, Target, Bell, Plus, UserPlus, StickyNote, Cloud, CloudRain, Sun, Wind,
  Heart, Smile, Frown, Meh, Laugh, Annoyed, Sparkles, Activity, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

/* ─── Types ─── */
interface LifeHealthData {
  score: number;
  lastActivity: string;
  sportGoal: string;
  sleepHours: number;
  sleepGoal: number;
}

interface LifeGoal {
  id: string;
  domain: string;
  title: string;
  progress: number;
  deadline: string;
}

/* ─── Constants ─── */
const MOOD_ICONS: Record<string, { icon: typeof Smile; color: string; label: string }> = {
  happy:    { icon: Laugh,    color: "text-amber-400",  label: "Heureux" },
  neutral:  { icon: Meh,      color: "text-blue-400",   label: "Neutre" },
  sad:      { icon: Frown,    color: "text-slate-400",  label: "Triste" },
  excited:  { icon: Sparkles, color: "text-violet-400", label: "Excité" },
  stressed: { icon: Annoyed,  color: "text-red-400",    label: "Stressé" },
};

const LS_KEYS = {
  briefingTimestamp: "tams-briefing-generated-at",
  health: "tams-life-health",
  goals: "tams-life-goals",
  mood: "tams-life-mood",
};

/* ─── Helpers ─── */
const urgencyColor = (u: string | null | undefined) => {
  if (u === "high") return "text-red-400";
  if (u === "medium") return "text-amber-400";
  return "text-emerald-400";
};

const urgencyDot = (u: string | null | undefined) => {
  if (u === "high") return "bg-red-500";
  if (u === "medium") return "bg-amber-500";
  return "bg-emerald-500";
};

const activityIcon: Record<string, string> = {
  task: "bg-blue-500/10 text-blue-400",
  project: "bg-violet-500/10 text-violet-400",
  contact: "bg-emerald-500/10 text-emerald-400",
  memory: "bg-amber-500/10 text-amber-400",
  decision: "bg-rose-500/10 text-rose-400",
  conversation: "bg-cyan-500/10 text-cyan-400",
  asset: "bg-orange-500/10 text-orange-400",
};

const priorityBadge: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "text-red-400 bg-red-500/10" },
  high: { label: "Haut", color: "text-amber-400 bg-amber-500/10" },
  medium: { label: "Moyen", color: "text-blue-400 bg-blue-500/10" },
  low: { label: "Bas", color: "text-muted-foreground bg-secondary" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

function formatBriefingAge(minutes: number): string {
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${Math.floor(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function loadFromLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/* ─── Sparkline component ─── */
function Sparkline({ data, color = "emerald" }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 120;
  const height = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  const colorClass = {
    emerald: "stroke-emerald-400",
    amber: "stroke-amber-400",
    blue: "stroke-blue-400",
    rose: "stroke-rose-400",
  }[color] || "stroke-emerald-400";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(colorClass, "opacity-80")}
        points={points}
      />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2.5"
            className={cn(colorClass, "fill-background stroke-[1.5]")}
          />
        );
      })}
    </svg>
  );
}

/* ─── Weather icon component ─── */
function WeatherIcon({ condition }: { condition: string }) {
  const icons: Record<string, React.ReactNode> = {
    sunny: <Sun className="w-8 h-8 text-amber-400 animate-pulse" />,
    cloudy: <Cloud className="w-8 h-8 text-slate-400" />,
    rainy: <CloudRain className="w-8 h-8 text-blue-400" />,
    windy: <Wind className="w-8 h-8 text-cyan-400" />,
  };
  return <>{icons[condition] || icons.cloudy}</>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function Accueil() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);

  /* ── Briefing freshness ── */
  const [briefingAge, setBriefingAge] = useState<number | null>(null);

  const { data: briefing, isLoading: briefingLoading } = useGetTodayBriefing();
  const { data: summary } = useGetDashboardSummary();
  const { data: workload } = useGetWorkload();
  const { data: activity } = useGetRecentActivity({ limit: 8 });
  const { data: tasks = [] } = useListTasks();
  const { data: decisions = [] } = useListDecisions();

  /* ── Life data from localStorage ── */
  const lifeHealth = useMemo<LifeHealthData | null>(() => {
    return loadFromLS<LifeHealthData | null>(LS_KEYS.health, null);
  }, []);

  const lifeGoals = useMemo<LifeGoal[]>(() => {
    return loadFromLS<LifeGoal[]>(LS_KEYS.goals, []);
  }, []);

  const lifeMood = useMemo<string>(() => {
    return loadFromLS<string>(LS_KEYS.mood, "happy");
  }, []);

  /* ── Briefing freshness tracking ──
     Use API createdAt when available, fallback to localStorage timestamp */
  useEffect(() => {
    if (briefing?.createdAt) {
      const diff = Date.now() - new Date(briefing.createdAt).getTime();
      setBriefingAge(Math.floor(diff / 60000));
    } else {
      const stored = localStorage.getItem(LS_KEYS.briefingTimestamp);
      if (stored) {
        const diff = Date.now() - parseInt(stored, 10);
        setBriefingAge(Math.floor(diff / 60000));
      }
    }
  }, [briefing]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (briefing?.createdAt) {
        const diff = Date.now() - new Date(briefing.createdAt).getTime();
        setBriefingAge(Math.floor(diff / 60000));
      } else {
        const stored = localStorage.getItem(LS_KEYS.briefingTimestamp);
        if (stored) {
          const diff = Date.now() - parseInt(stored, 10);
          setBriefingAge(Math.floor(diff / 60000));
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [briefing]);

  const stats = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Tâches", value: summary.taskStats.todo + summary.taskStats.inProgress, icon: CheckSquare, color: "text-blue-400" },
      { label: "Projets", value: summary.projectStats.active, icon: FolderOpen, color: "text-violet-400" },
      { label: "Contacts", value: summary.contactStats.total, icon: Users, color: "text-emerald-400" },
      { label: "Mémoires", value: summary.memoryCount, icon: Brain, color: "text-amber-400" },
    ];
  }, [summary]);

  const blockedTasks = useMemo(() => tasks.filter((t: Task) => t.status === "todo" && t.priority === "urgent"), [tasks]);
  const overdueTasks = useMemo(() => tasks.filter((t: Task) => t.status !== "done" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate) < new Date()), [tasks]);
  const dueTodayTasks = useMemo(() => tasks.filter((t: Task) => {
    if (t.status === "done" || t.status === "cancelled" || !t.dueDate) return false;
    const d = new Date(t.dueDate);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }), [tasks]);
  const pendingDecisions = useMemo(() => decisions.filter((d: Decision) => d.status === "pending"), [decisions]);

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  });

  const updateDecision = useUpdateDecision({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListDecisionsQueryKey() }),
    },
  });

  const generate = useGenerateBriefing({
    mutation: {
      onSuccess: () => {
        localStorage.setItem(LS_KEYS.briefingTimestamp, Date.now().toString());
        setBriefingAge(0);
        qc.invalidateQueries({ queryKey: getGetTodayBriefingQueryKey() });
        toast({ title: "Briefing régénéré" });
      },
    },
  });

  const criticalCount = overdueTasks.length + blockedTasks.length + pendingDecisions.length;

  /* ── Briefing freshness badge ── */
  const freshnessBadge = useMemo(() => {
    if (briefingAge === null) return null;
    if (briefingAge < 60) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          Briefing du jour
        </span>
      );
    }
    if (briefingAge < 1440) {
      return (
        <button
          onClick={() => generate.mutate()}
          className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors animate-pulse"
        >
          <RefreshCw className="w-3 h-3" />
          Rafraîchir
        </button>
      );
    }
    return (
      <button
        onClick={() => generate.mutate()}
        className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full hover:bg-red-500/20 transition-colors animate-pulse"
      >
        <AlertTriangle className="w-3 h-3" />
        Briefing obsolète
      </button>
    );
  }, [briefingAge, generate]);

  /* ── FAB actions ── */
  const fabActions = [
    { label: "Nouvelle tâche", icon: CheckSquare, color: "bg-blue-500", navigateTo: "/travail" },
    { label: "Nouvelle décision", icon: Lightbulb, color: "bg-amber-500", navigateTo: "/systeme" },
    { label: "Nouveau contact", icon: UserPlus, color: "bg-emerald-500", navigateTo: "/travail" },
    { label: "Nouvelle note", icon: StickyNote, color: "bg-violet-500", navigateTo: "/systeme" },
  ];

  /* ── Weather condition (derived from workload) ── */
  const weatherCondition = useMemo(() => {
    if (!workload) return "cloudy";
    if (workload.weeklyCapacity > 80) return "rainy";
    if (workload.weeklyCapacity > 60) return "windy";
    if (workload.weeklyCapacity < 30) return "sunny";
    return "cloudy";
  }, [workload]);

  /* ── Mock sparkline data (would come from API) ── */
  const workloadSparkline = useMemo(() => {
    // In real app, this would come from workload history
    return workload ? [45, 52, 48, 60, 55, workload.weeklyCapacity, 50] : [];
  }, [workload]);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain relative">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-28 md:pb-10 space-y-5 stagger-up">

        {/* ═══════════════════════════════════════════════════════════════════
            HEADER with freshness indicator
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex items-start justify-between animate-fade-in">
          <div className="flex-1 min-w-0">
            {briefingLoading ? (
              <div className="space-y-2">
                <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
                <div className="h-4 w-32 bg-muted rounded-lg animate-pulse" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                  {briefing?.greeting ?? "Bonjour"}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                  {briefingAge !== null && (
                    <span className="text-[10px] text-muted-foreground">
                      · Briefing généré {formatBriefingAge(briefingAge)}
                    </span>
                  )}
                  {freshnessBadge}
                </div>
              </>
            )}
          </div>
          <button
            data-testid="button-generate-briefing"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            aria-label="Rafraîchir le briefing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/80 backdrop-blur-sm hover:bg-accent text-secondary-foreground text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50 min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring shrink-0 ml-2"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", generate.isPending && "animate-spin")} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            CRITICAL ALERTS (glassmorphism)
            ═══════════════════════════════════════════════════════════════════ */}
        {criticalCount > 0 && (
          <div className="flex flex-wrap gap-2 animate-fade-in" style={{ animationDelay: ".03s" }}>
            {overdueTasks.length > 0 && (
              <button
                onClick={() => setFilter(filter === "overdue" ? null : "overdue")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 active:scale-[0.98] min-h-[44px] backdrop-blur-md hover:shadow-md",
                  filter === "overdue"
                    ? "bg-red-500 text-white shadow-lg shadow-red-500/20 animate-glow-pulse"
                    : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                )}
              >
                <AlertCircle className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                {overdueTasks.length} en retard
              </button>
            )}
            {blockedTasks.length > 0 && (
              <button
                onClick={() => setFilter(filter === "blocked" ? null : "blocked")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 active:scale-[0.98] min-h-[44px] backdrop-blur-md hover:shadow-md",
                  filter === "blocked"
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                    : "bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20"
                )}
              >
                <Ban className="w-3.5 h-3.5" />
                {blockedTasks.length} bloqué{blockedTasks.length > 1 ? "s" : ""}
              </button>
            )}
            {pendingDecisions.length > 0 && (
              <button
                onClick={() => setFilter(filter === "decisions" ? null : "decisions")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 active:scale-[0.98] min-h-[44px] backdrop-blur-md hover:shadow-md",
                  filter === "decisions"
                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                )}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                {pendingDecisions.length} décision{pendingDecisions.length > 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            STATS STRIP (glassmorphism cards)
            ═══════════════════════════════════════════════════════════════════ */}
        {stats.length > 0 && (
          <div className="grid grid-cols-4 gap-2 animate-fade-in" style={{ animationDelay: ".05s" }}>
            {stats.map((s, i) => (
              <button
                key={s.label}
                onClick={() => {
                  if (s.label === "Tâches") navigate("/travail");
                  if (s.label === "Projets") navigate("/travail");
                  if (s.label === "Contacts") navigate("/travail");
                  if (s.label === "Mémoires") navigate("/systeme");
                }}
                className="group relative bg-card/60 backdrop-blur-md border border-card-border/60 rounded-xl p-3 text-center transition-all duration-300 hover:border-border/80 hover:bg-card/80 active:scale-[0.98] overflow-hidden hover-lift"
                aria-label={`${s.label}: ${s.value}`}
                style={{ animationDelay: `${0.05 + i * 0.05}s` }}
              >
                {/* Subtle gradient overlay */}
                <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                  s.label === "Tâches" ? "bg-gradient-to-br from-blue-500/5 to-transparent" :
                  s.label === "Projets" ? "bg-gradient-to-br from-violet-500/5 to-transparent" :
                  s.label === "Contacts" ? "bg-gradient-to-br from-emerald-500/5 to-transparent" :
                  "bg-gradient-to-br from-amber-500/5 to-transparent"
                )} />
                <s.icon className={cn("w-4 h-4 mx-auto mb-1 relative z-10 transition-transform duration-300 group-hover:scale-110", s.color)} strokeWidth={1.7} />
                <div className="text-lg font-semibold text-foreground relative z-10 transition-transform duration-300 group-hover:scale-105">{s.value}</div>
                <div className="text-[10px] text-muted-foreground relative z-10">{s.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MA VIE - Personal life integration (NEW)
            ═══════════════════════════════════════════════════════════════════ */}
        {(lifeHealth || lifeGoals.length > 0) && (
          <div className="animate-fade-in" style={{ animationDelay: ".06s" }}>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Ma Vie</span>
            </div>
            <div className="bg-gradient-to-br from-rose-500/5 via-card/60 to-violet-500/5 backdrop-blur-md border border-card-border/60 rounded-xl p-4 relative overflow-hidden">
              {/* Decorative shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent animate-shimmer" />

              <div className="relative z-10 flex items-center gap-4">
                {/* Health score */}
                {lifeHealth && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] text-muted-foreground">Santé</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{lifeHealth.score}</div>
                    <div className="text-[10px] text-muted-foreground">/100 score</div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-sky-400 rounded-full transition-all"
                        style={{ width: `${lifeHealth.score}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Mood */}
                <div className="flex flex-col items-center px-3 border-l border-border/50">
                  {(() => {
                    const mood = MOOD_ICONS[lifeMood] || MOOD_ICONS.happy;
                    const Icon = mood.icon;
                    return (
                      <>
                        <Icon className={cn("w-6 h-6", mood.color)} />
                        <span className="text-[10px] text-muted-foreground mt-1">{mood.label}</span>
                      </>
                    );
                  })()}
                </div>

                {/* Goals */}
                {lifeGoals.length > 0 && (
                  <div className="flex-1 min-w-0 border-l border-border/50 pl-3">
                    <div className="text-[10px] text-muted-foreground mb-1">Objectifs</div>
                    <div className="space-y-1.5">
                      {lifeGoals.slice(0, 2).map(g => (
                        <div key={g.id}>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-foreground truncate">{g.title}</span>
                            <span className="text-muted-foreground shrink-0 ml-1">{g.progress}%</span>
                          </div>
                          <div className="h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all",
                                g.domain === "health" ? "bg-emerald-500" :
                                g.domain === "finance" ? "bg-violet-500" :
                                "bg-sky-500"
                              )}
                              style={{ width: `${g.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => navigate("/vie")}
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground text-xs font-medium transition-all active:scale-[0.98]"
              >
                Ouvrir Ma Vie <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            WEATHER / OPERATIONAL STATUS (IMPROVED)
            ═══════════════════════════════════════════════════════════════════ */}
        {workload && (
          <div className="animate-fade-in" style={{ animationDelay: ".08s" }}>
            <div className="bg-gradient-to-br from-sky-500/5 via-card/60 to-amber-500/5 backdrop-blur-md border border-card-border/60 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent animate-shimmer" />

              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center">
                    <WeatherIcon condition={weatherCondition} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {workload.weeklyCapacity > 80 ? "Tempête de travail" :
                       workload.weeklyCapacity > 60 ? "Charge élevée" :
                       workload.weeklyCapacity < 30 ? "Journée calme" : "Conditions normales"}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">Charge: {workload.weeklyCapacity}%</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className={cn("text-[10px]",
                        workload.weeklyCapacity > 80 ? "text-red-400" :
                        workload.weeklyCapacity > 60 ? "text-amber-400" :
                        "text-emerald-400"
                      )}>
                        {workload.weeklyCapacity > 80 ? "Humeur: stressée" :
                         workload.weeklyCapacity > 60 ? "Humeur: tendue" :
                         "Humeur: sereine"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sparkline */}
                {workloadSparkline.length > 0 && (
                  <div className="hidden sm:block">
                    <Sparkline
                      data={workloadSparkline}
                      color={workload.weeklyCapacity > 80 ? "rose" : workload.weeklyCapacity > 60 ? "amber" : "emerald"}
                    />
                  </div>
                )}
              </div>

              {/* Energy bar */}
              <div className="relative z-10 mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Énergie estimée</span>
                  <span className={cn("text-[10px]",
                    workload.weeklyCapacity > 80 ? "text-red-400" :
                    workload.weeklyCapacity > 60 ? "text-amber-400" :
                    "text-emerald-400"
                  )}>
                    {workload.weeklyCapacity > 80 ? "Épuisé" :
                     workload.weeklyCapacity > 60 ? "Fatigué" :
                     "Reposé"}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700 bg-gradient-to-r",
                      workload.weeklyCapacity > 80 ? "from-red-400 to-rose-500" :
                      workload.weeklyCapacity > 60 ? "from-amber-400 to-orange-500" :
                      "from-emerald-400 to-sky-400"
                    )}
                    style={{ width: `${Math.max(5, 100 - workload.weeklyCapacity)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            WORKLOAD BAR (kept, with glassmorphism)
            ═══════════════════════════════════════════════════════════════════ */}
        {workload && (
          <div className="bg-card/60 backdrop-blur-md border border-card-border/60 rounded-xl p-4 animate-fade-in" style={{ animationDelay: ".1s" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">Charge de travail</span>
              <span className="text-xs text-muted-foreground">{workload.weeklyCapacity}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700 bg-gradient-to-r",
                  workload.weeklyCapacity > 80 ? "from-red-400 to-rose-500" :
                  workload.weeklyCapacity > 60 ? "from-amber-400 to-orange-500" :
                  "from-emerald-400 to-sky-400"
                )}
                style={{ width: `${workload.weeklyCapacity}%` }}
              />
            </div>
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              {workload.urgentTaskCount > 0 && (
                <button onClick={() => navigate("/travail")} className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 px-2 py-1 rounded-full transition-colors hover:bg-red-500/20 hover:scale-105 active:scale-95">
                  <ShieldAlert className="w-3 h-3" /> {workload.urgentTaskCount} urgent{workload.urgentTaskCount > 1 ? "s" : ""}
                </button>
              )}
              {workload.dueTodayCount > 0 && (
                <button onClick={() => navigate("/travail")} className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full transition-colors hover:bg-amber-500/20 hover:scale-105 active:scale-95">
                  <Clock className="w-3 h-3" /> {workload.dueTodayCount} aujourd'hui
                </button>
              )}
              {workload.overdueCount > 0 && (
                <button onClick={() => navigate("/travail")} className="flex items-center gap-1 text-[11px] text-red-500 bg-red-500/10 px-2 py-1 rounded-full transition-colors hover:bg-red-500/20 hover:scale-105 active:scale-95">
                  <AlertCircle className="w-3 h-3" /> {workload.overdueCount} en retard
                </button>
              )}
              {workload.urgentTaskCount === 0 && workload.dueTodayCount === 0 && workload.overdueCount === 0 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Aucune urgence
                </span>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SMART REMINDERS
            ═══════════════════════════════════════════════════════════════════ */}
        {workload && (
          <div className="animate-fade-in" style={{ animationDelay: ".12s" }}>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Rappels intelligents</span>
            </div>
            <div className="space-y-1.5">
              {workload.urgentTaskCount > 0 && (
                <ReminderCard
                  icon={<ShieldAlert className="w-3.5 h-3.5 text-red-400" />}
                  text={`${workload.urgentTaskCount} tâche${workload.urgentTaskCount > 1 ? "s" : ""} urgente${workload.urgentTaskCount > 1 ? "s" : ""} nécessite${workload.urgentTaskCount > 1 ? "nt" : ""} votre attention`}
                  action="Voir"
                  onAction={() => navigate("/travail")}
                />
              )}
              {overdueTasks.length > 0 && (
                <ReminderCard
                  icon={<AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  text={`${overdueTasks.length} tâche${overdueTasks.length > 1 ? "s" : ""} en retard`}
                  action="Traiter"
                  onAction={() => navigate("/travail")}
                />
              )}
              {pendingDecisions.length > 0 && (
                <ReminderCard
                  icon={<Lightbulb className="w-3.5 h-3.5 text-amber-400" />}
                  text={`${pendingDecisions.length} décision${pendingDecisions.length > 1 ? "s" : ""} en attente`}
                  action="Décider"
                  onAction={() => navigate("/systeme")}
                />
              )}
              {criticalCount === 0 && (
                <ReminderCard
                  icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  text="Tout est sous contrôle. Profitez de votre journée !"
                  action=""
                  onAction={() => {}}
                />
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            BLOCKED TASKS
            ═══════════════════════════════════════════════════════════════════ */}
        {(filter === null || filter === "blocked") && blockedTasks.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: ".14s" }}>
            <div className="flex items-center gap-2 mb-2">
              <Ban className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Ce qui bloque</span>
            </div>
            <div className="space-y-1.5">
              {blockedTasks.map((task: Task) => (
                <div key={task.id} className="bg-card/60 backdrop-blur-md border border-orange-500/20 rounded-xl p-3 hover:bg-card/80 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{task.title}</div>
                      {task.projectName && <div className="text-[10px] text-muted-foreground">{task.projectName}</div>}
                    </div>
                    <button
                      onClick={() => updateTask.mutate({ id: task.id, data: { status: "in_progress" } })}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-[10px] font-medium hover:bg-orange-500/20 transition-all active:scale-[0.98] min-h-[36px] hover:shadow-sm"
                    >
                      Débloquer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            NEXT ACTIONS
            ═══════════════════════════════════════════════════════════════════ */}
        {(filter === null || filter === "overdue") && (dueTodayTasks.length > 0 || overdueTasks.length > 0) && (
          <div className="animate-fade-in" style={{ animationDelay: ".16s" }}>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Prochaines actions</span>
            </div>
            <div className="space-y-1.5">
              {[...overdueTasks, ...dueTodayTasks].slice(0, 5).map(task => (
                <button
                  key={task.id}
                  onClick={() => navigate("/travail")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card/60 backdrop-blur-md border border-card-border/60 hover:border-border/80 hover:bg-card/80 transition-all text-left active:scale-[0.98]"
                >
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      updateTask.mutate({ id: task.id, data: { status: task.status === "done" ? "todo" : "done" } });
                    }}
                    className="shrink-0 w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center hover:border-primary transition-colors"
                    aria-label={task.status === "done" ? "Marquer comme à faire" : "Marquer comme terminé"}
                  >
                    {task.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm", task.status === "done" && "line-through text-muted-foreground")}>{task.title}</div>
                    {task.projectName && <div className="text-[10px] text-muted-foreground">{task.projectName}</div>}
                  </div>
                  {task.priority && (
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full shrink-0", priorityBadge[task.priority]?.color || priorityBadge.low.color)}>
                      {priorityBadge[task.priority]?.label || "Bas"}
                    </span>
                  )}
                  {task.dueDate && new Date(task.dueDate) < new Date() && (
                    <span className="text-[10px] text-red-400 shrink-0">{timeAgo(task.dueDate)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PENDING DECISIONS
            ═══════════════════════════════════════════════════════════════════ */}
        {(filter === null || filter === "decisions") && pendingDecisions.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: ".18s" }}>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Décisions en attente</span>
            </div>
            <div className="space-y-1.5">
              {pendingDecisions.slice(0, 3).map((decision: Decision) => (
                <div key={decision.id} className="bg-card/60 backdrop-blur-md border border-card-border/60 rounded-xl p-3 hover:bg-card/80 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{decision.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Créée il y a {timeAgo(decision.createdAt)}</div>
                    </div>
                    <button
                      onClick={() => {
                        updateDecision.mutate({ id: decision.id, data: { status: "decided" } });
                        toast({ title: "Décision marquée comme prise" });
                      }}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-medium hover:bg-amber-500/20 transition-all active:scale-[0.98] min-h-[36px] hover:shadow-sm"
                    >
                      Décider
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            BRIEFING IA (with improved skeleton)
            ═══════════════════════════════════════════════════════════════════ */}
        {briefingLoading ? (
          <div className="space-y-3 animate-fade-in" style={{ animationDelay: ".2s" }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-card/60 backdrop-blur-md rounded-xl overflow-hidden relative shimmer">
                <div className="p-4 space-y-3">
                  <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : briefing && (
          <div className="space-y-3 animate-fade-in" style={{ animationDelay: ".2s" }}>
            {/* Priorities */}
            {briefing.priorities.length > 0 && (
              <Section title="Priorités" icon={<Star className="w-3.5 h-3.5 text-amber-400" />}>
                {(briefing.priorities as any[]).map((item, i) => (
                  <BriefingItem key={i} item={item} />
                ))}
              </Section>
            )}
            {/* Risks */}
            {briefing.risks.length > 0 && (
              <Section title="Risques" icon={<AlertTriangle className="w-3.5 h-3.5 text-red-400" />}>
                {(briefing.risks as any[]).map((item, i) => (
                  <BriefingItem key={i} item={item} />
                ))}
              </Section>
            )}
            {/* Opportunities */}
            {briefing.opportunities.length > 0 && (
              <Section title="Opportunités" icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}>
                {(briefing.opportunities as any[]).map((item, i) => (
                  <BriefingItem key={i} item={item} />
                ))}
              </Section>
            )}
            {/* Recommendations */}
            {briefing.recommendations.length > 0 && (
              <Section title="Recommandations IA" icon={<Zap className="w-3.5 h-3.5 text-primary" />}>
                {(briefing.recommendations as any[]).map((item, i) => (
                  <BriefingItem key={i} item={item} />
                ))}
              </Section>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            RECENT ACTIVITY
            ═══════════════════════════════════════════════════════════════════ */}
        {activity && activity.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: ".24s" }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activité récente</span>
            </div>
            <div className="space-y-1">
              {activity.map((item: ActivityItem) => (
                <button
                  key={item.id}
                  data-testid={`activity-item-${item.id}`}
                  onClick={() => {
                    if (item.type === "task" || item.type === "project" || item.type === "contact") navigate("/travail");
                    else if (item.type === "memory" || item.type === "decision") navigate("/systeme");
                    else if (item.type === "conversation") navigate("/chat");
                    else if (item.type === "asset") navigate("/studio");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left active:scale-[0.98]"
                >
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", activityIcon[item.type] ?? "bg-muted text-muted-foreground")}>
                    {item.type[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">{item.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          FLOATING ACTION BUTTON (FAB) with radial menu
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Radial menu items */}
        <div className={cn(
          "flex flex-col items-end gap-2 transition-all duration-300",
          fabOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}>
          {fabActions.map((action, i) => (
            <button
              key={action.label}
              onClick={() => {
                setFabOpen(false);
                navigate(action.navigateTo);
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-full text-white text-xs font-medium shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 animate-slide-up",
                action.color
              )}
              style={{
                transitionDelay: fabOpen ? `${i * 40}ms` : "0ms",
                animationDelay: fabOpen ? `${i * 50}ms` : "0ms",
              }}
            >
              <span className="hidden sm:inline">{action.label}</span>
              <action.icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Main FAB button */}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-xl shadow-primary/20 transition-all duration-300 active:scale-90 animate-float",
            fabOpen
              ? "bg-destructive hover:bg-destructive/90 rotate-45"
              : "bg-primary hover:bg-primary/90 glow-sm"
          )}
          aria-label={fabOpen ? "Fermer le menu" : "Actions rapides"}
        >
          {fabOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <Plus className="w-6 h-6 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════════ */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card/60 backdrop-blur-md border border-card-border/60 rounded-xl overflow-hidden hover:border-border/80 transition-colors">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-card-border/60 bg-gradient-to-r from-primary/5 to-transparent">
        {icon}
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function BriefingItem({ item }: { item: { label: string; description: string; urgency?: string | null } }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
      <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", urgencyDot(item.urgency))} />
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-medium", urgencyColor(item.urgency))}>{item.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</div>
      </div>
    </div>
  );
}

function ReminderCard({ icon, text, action, onAction }: { icon: React.ReactNode; text: string; action: string; onAction: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card/60 backdrop-blur-md border border-card-border/60 hover:bg-card/80 transition-colors">
      {icon}
      <span className="flex-1 text-xs text-foreground">{text}</span>
      {action && (
        <button
          onClick={onAction}
          className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors active:scale-[0.98]"
        >
          {action} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
