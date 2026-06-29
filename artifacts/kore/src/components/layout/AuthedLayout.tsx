import { useEffect, type ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Shield,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  Brain,
  Network,
  Activity,
  Wand2,
  Zap,
  MessageSquare,
  Bot,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/chat", label: "Chat OS", icon: MessageSquare },
  { href: "/cos", label: "Chief of Staff", icon: Brain },
  { href: "/memory", label: "Memory Graph", icon: Network },
  { href: "/ops", label: "Ops Watcher", icon: Activity },
  { href: "/studio", label: "Studio", icon: Wand2 },
  { href: "/actions", label: "Action Hub", icon: Zap },
  { href: "/security", label: "Sécurité", icon: Shield },
];

function NavItem({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [location] = useLocation();
  const active = location === href || (href !== "/dashboard" && location.startsWith(href));

  return (
    <Link href={href}>
      <span
        className={[
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        ].join(" ")}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </span>
    </Link>
  );
}

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate("/auth");
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!user) return null;

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border/50 bg-card/30 lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border/50 px-4">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
            <span className="text-[10px] font-bold text-primary-foreground">T</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">TAMS</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        <div className="border-t border-border/50 p-3">
          <div className="mb-2 flex items-center gap-2 px-3 py-1">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-muted-foreground">
              {user.email?.[0] ?? "?"}
            </div>
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border/50 bg-card/30 px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <span className="text-[10px] font-bold text-primary-foreground">T</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">TAMS</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <nav className="flex gap-2">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <span className="text-sm text-muted-foreground hover:text-foreground">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
          <button onClick={signOut} className="ml-auto text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
