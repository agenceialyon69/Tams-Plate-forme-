import { useState } from "react";
import { useGetNotifications } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Bell, X, AlertTriangle, Clock, Users, GitFork, Zap, FolderOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const severityConfig = {
  critical: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", dot: "bg-red-500" },
  warning: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", dot: "bg-amber-500" },
  info: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", dot: "bg-blue-500" },
};

const typeIcon: Record<string, React.ElementType> = {
  overdue_task: AlertTriangle,
  due_today: Clock,
  contact_followup: Users,
  pending_decision: GitFork,
  urgent_task: Zap,
  stale_project: FolderOpen,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { data: notifications = [], isLoading } = useGetNotifications({
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

  const criticalCount = notifications.filter(n => n.severity === "critical").length;
  const total = notifications.length;

  return (
    <div className="relative">
      <button
        data-testid="button-notification-bell"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
          open ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white",
            criticalCount > 0 ? "bg-red-500" : "bg-amber-500"
          )}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 max-h-[480px] z-50 bg-card border border-card-border rounded-xl shadow-xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {total > 0 && <span className="text-xs text-muted-foreground">({total})</span>}
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-1">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg animate-pulse" />)}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                    <Bell className="w-5 h-5 text-emerald-400" />
                  </div>
                  <p className="text-sm text-muted-foreground">Tout est à jour</p>
                  <p className="text-xs text-muted-foreground mt-1">Aucune alerte en cours</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map(n => {
                    const s = severityConfig[n.severity as keyof typeof severityConfig] ?? severityConfig.info;
                    const Icon = typeIcon[n.type] ?? Bell;
                    return (
                      <button
                        key={n.id}
                        data-testid={`notification-${n.id}`}
                        onClick={() => { setLocation(n.actionHref); setOpen(false); }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left group"
                      >
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", s.bg, s.border, "border")}>
                          <Icon className={cn("w-3.5 h-3.5", s.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
                            <span className={cn("text-xs font-semibold truncate", s.color)}>{n.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.description}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground shrink-0 mt-1 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
