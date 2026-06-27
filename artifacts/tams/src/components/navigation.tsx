import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Briefcase, Layers, Cpu, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notifications-panel";

const navItems = [
  { href: "/",        label: "Accueil", icon: Home },
  { href: "/chat",    label: "Chat",    icon: MessageSquare },
  { href: "/agents",  label: "Agents",  icon: Users },
  { href: "/travail", label: "Travail", icon: Briefcase },
  { href: "/studio",  label: "Studio",  icon: Layers },
  { href: "/systeme", label: "Système", icon: Cpu },
];

export function BottomNav() {
  const [location] = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-1 py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <button
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] justify-center",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("w-5 h-5 transition-transform", active && "scale-110")}
                  strokeWidth={active ? 2.2 : 1.7}
                />
                <span className={cn("text-[10px] font-medium tracking-wide", active ? "opacity-100" : "opacity-60")}>
                  {label}
                </span>
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
  return (
    <aside
      className="hidden md:flex flex-col w-56 min-h-screen border-r border-sidebar-border bg-sidebar shrink-0"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
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
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-left",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.2 : 1.7} />
                {label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            </Link>
          );
        })}
      </nav>
      <div
        className="px-5 py-4 border-t border-sidebar-border"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="text-xs text-muted-foreground">Mohamed · Personal OS</div>
      </div>
    </aside>
  );
}
