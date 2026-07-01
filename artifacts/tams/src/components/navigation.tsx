import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Briefcase, Layers, Cpu, Users, Heart, WifiOff, RefreshCw, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notifications-panel";
import { useOffline } from "@/hooks/useOffline";

const navItems = [
  { href: "/",        label: "Accueil", icon: Home },
  { href: "/chat",    label: "Chat",    icon: MessageSquare },
  { href: "/agents",  label: "Agents",  icon: Users },
  { href: "/travail", label: "Travail", icon: Briefcase },
  { href: "/vie",     label: "Vie",     icon: Heart },
  { href: "/studio",  label: "Studio",  icon: Layers },
  { href: "/systeme", label: "Système", icon: Cpu },
  { href: "/capabilities", label: "Capacités", icon: ListChecks },
];

export function BottomNav() {
  const [location] = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", touchAction: "manipulation" }}
      aria-label="Navigation principale"
    >
      <div className="flex items-center justify-around px-1 py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                data-testid={`nav-${label.toLowerCase()}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-300 min-w-[44px] min-h-[44px] justify-center relative",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <Icon
                  className={cn("w-5 h-5 transition-all duration-300", active && "scale-110")}
                  strokeWidth={active ? 2.2 : 1.7}
                />
                <span className={cn("text-[10px] font-medium tracking-wide transition-all duration-300", active ? "opacity-100" : "opacity-60")}>
                  {label}
                </span>
                {active && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary animate-nav-indicator" />
                )}
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { isOnline, isSyncing, queueLength, syncQueue } = useOffline();
  return (
    <aside
      className="hidden md:flex flex-col w-56 min-h-screen border-r border-sidebar-border bg-sidebar shrink-0"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
      aria-label="Barre latérale"
    >
      <div className="px-5 pt-7 pb-6 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Cpu className="w-4 h-4 text-primary-foreground" strokeWidth={2} />
            </div>
            <div>
              <div className="text-sm font-semibold text-sidebar-foreground tracking-tight">TAMS</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">AI OS</div>
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                data-testid={`sidebar-${label.toLowerCase()}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 text-left relative overflow-hidden",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0 transition-transform duration-300", active && "scale-110")} strokeWidth={active ? 2.2 : 1.7} />
                <span className="transition-opacity duration-300">{label}</span>
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-glow-pulse" />
                )}
              </button>
            </Link>
          );
        })}
      </nav>
      <div
        className="px-5 py-4 border-t border-sidebar-border space-y-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* Offline badge */}
        {!isOnline && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-400 font-medium">Mode hors ligne</span>
            {queueLength > 0 && (
              <span className="text-[10px] text-amber-400/70 ml-auto">{queueLength} en attente</span>
            )}
          </div>
        )}
        {/* Sync indicator */}
        {isOnline && queueLength > 0 && (
          <button
            onClick={syncQueue}
            disabled={isSyncing}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-blue-400 shrink-0", isSyncing && "animate-spin")} />
            <span className="text-xs text-blue-400 font-medium">
              {isSyncing ? "Synchronisation..." : `Synchroniser (${queueLength})`}
            </span>
          </button>
        )}
        <div className="text-xs text-muted-foreground">Mohamed · Personal OS</div>
      </div>
    </aside>
  );
}