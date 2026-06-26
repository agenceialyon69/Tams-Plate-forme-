import { useState } from "react";
import { useGetTodayBriefing, useGenerateBriefing, useGetDashboardSummary, useGetWorkload, useGetRecentActivity, getGetTodayBriefingQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, Zap, Star, RefreshCw, CheckSquare, FolderOpen, Users, Brain, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

export default function Accueil() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: briefing, isLoading: briefingLoading } = useGetTodayBriefing();
  const { data: summary } = useGetDashboardSummary();
  const { data: workload } = useGetWorkload();
  const { data: activity } = useGetRecentActivity({ limit: 8 });
  const generate = useGenerateBriefing({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetTodayBriefingQueryKey() });
        toast({ title: "Briefing régénéré" });
      },
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-28 md:pb-10 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between animate-fade-in">
          <div>
            {briefingLoading ? (
              <div className="h-8 w-48 bg-muted rounded-lg animate-pulse mb-1" />
            ) : (
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                {briefing?.greeting ?? "Bonjour Mohamed"}
              </h1>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <button
            data-testid="button-generate-briefing"
            onClick={() => generate.mutate({})}
            disabled={generate.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", generate.isPending && "animate-spin")} />
            Actualiser
          </button>
        </div>

        {/* Stat strip */}
        {summary && (
          <div className="grid grid-cols-4 gap-2 animate-fade-in" style={{ animationDelay: ".05s" }}>
            {[
              { label: "Tâches", value: summary.taskStats.todo + summary.taskStats.inProgress, icon: CheckSquare, color: "text-blue-400" },
              { label: "Projets", value: summary.projectStats.active, icon: FolderOpen, color: "text-violet-400" },
              { label: "Contacts", value: summary.contactStats.total, icon: Users, color: "text-emerald-400" },
              { label: "Mémoires", value: summary.memoryCount, icon: Brain, color: "text-amber-400" },
            ].map(s => (
              <div key={s.label} className="bg-card border border-card-border rounded-xl p-3 text-center">
                <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} strokeWidth={1.7} />
                <div className="text-lg font-semibold text-foreground">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Workload bar */}
        {workload && (
          <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in" style={{ animationDelay: ".08s" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">Charge de travail</span>
              <span className="text-xs text-muted-foreground">{workload.weeklyCapacity}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", workload.weeklyCapacity > 80 ? "bg-red-500" : workload.weeklyCapacity > 60 ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${workload.weeklyCapacity}%` }}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {workload.urgentTaskCount > 0 && <span className="text-red-400">{workload.urgentTaskCount} urgent{workload.urgentTaskCount > 1 ? "s" : ""}</span>}
              {workload.dueTodayCount > 0 && <span className="text-amber-400">{workload.dueTodayCount} aujourd'hui</span>}
              {workload.overdueCount > 0 && <span className="text-red-500">{workload.overdueCount} en retard</span>}
              {workload.urgentTaskCount === 0 && workload.dueTodayCount === 0 && <span className="text-emerald-400">Aucune urgence</span>}
            </div>
          </div>
        )}

        {briefingLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : briefing && (
          <div className="space-y-3 stagger">
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

        {/* Recent activity */}
        {activity && activity.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: ".3s" }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activité récente</span>
            </div>
            <div className="space-y-1">
              {activity.map((item) => (
                <div key={item.id} data-testid={`activity-item-${item.id}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", activityIcon[item.type] ?? "bg-muted text-muted-foreground")}>
                    {item.type[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">{item.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-card-border">
        {icon}
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function BriefingItem({ item }: { item: { label: string; description: string; urgency?: string | null } }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", urgencyDot(item.urgency))} />
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-medium", urgencyColor(item.urgency))}>{item.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</div>
      </div>
    </div>
  );
}
