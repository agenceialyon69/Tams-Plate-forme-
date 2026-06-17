import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Compass,
  CheckCircle2,
  BrainCircuit,
  Activity,
  MoonStar,
  Home,
  Mic,
  BarChart2,
  Settings2,
  LogOut,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { QuickCapture } from "@/components/QuickCapture";
import { LoginGate } from "@/components/LoginGate";
import { useEffect, useState } from "react";
import { loadPrefs } from "@/hooks/useNotifications";
import { clearToken } from "@/lib/auth";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function useScheduleNotifications() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const prefs = loadPrefs();
    if (
      !prefs.enabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({
        type: "SCHEDULE_NOTIFICATIONS",
        morningTime: prefs.morningTime,
        eveningTime: prefs.eveningTime,
      });
    });
  }, []);
}

function KoreLogo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect width="28" height="28" rx="6" fill="currentColor" className="text-foreground" />
      <text
        x="14"
        y="20"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="16"
        fontWeight="600"
        fill="hsl(var(--background))"
      >
        K
      </text>
    </svg>
  );
}

const navItems = [
  { href: "/", label: "Aperçu", icon: Home },
  { href: "/capture", label: "Capture", icon: Mic },
  { href: "/tasks", label: "Tâches", icon: CheckCircle2 },
  { href: "/memory", label: "Mémoire", icon: BrainCircuit },
  { href: "/decisions", label: "Décisions", icon: Compass },
  { href: "/evening", label: "Revue", icon: MoonStar },
  { href: "/overload", label: "Bien-être", icon: Activity },
  { href: "/weekly", label: "Bilan", icon: BarChart2 },
  { href: "/settings", label: "Paramètres", icon: Settings2 },
];

function AppSidebar() {
  const [location, navigate] = useLocation();
  const [today, setToday] = useState(() => format(new Date(), "EEEE d MMM", { locale: fr }));
  useScheduleNotifications();

  useEffect(() => {
    const id = setInterval(() => {
      setToday(format(new Date(), "EEEE d MMM", { locale: fr }));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  function handleLogout() {
    clearToken();
    navigate("/");
  }

  return (
    <>
      <div className="hidden md:flex">
        <Sidebar>
          <SidebarHeader className="py-5 px-4 border-b border-border/40">
            <div className="flex items-center gap-2.5 px-1">
              <KoreLogo />
              <div>
                <h1 className="font-serif text-lg tracking-tight text-foreground font-semibold leading-none">
                  KORE
                </h1>
                <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{today}</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="flex flex-col h-full">
            <SidebarMenu className="px-2 py-3 flex-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive ? "border-l-2 border-accent rounded-l-none pl-3" : "pl-[calc(1rem+2px)]"}
                    >
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 py-2"
                      >
                        <item.icon
                          className={`w-4 h-4 ${isActive ? "text-accent" : "opacity-50"}`}
                        />
                        <span className={isActive ? "font-medium" : ""}>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            <div className="border-t border-border/40 px-3 py-3 space-y-1">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
                  ⌘K
                </kbd>
                <span>Capture rapide</span>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4 opacity-50" />
                <span>Déconnexion</span>
              </button>
            </div>
          </SidebarContent>
        </Sidebar>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border flex items-center justify-around pb-safe">
        {[
          navItems[0],
          navItems[1],
          navItems[2],
          navItems[5],
          navItems[8],
        ].map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-3 px-2 flex-1 transition-colors ${
                isActive ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 mb-0.5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className={`text-[9px] font-medium ${isActive ? "font-semibold" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Router() {
  return (
    <div className="flex min-h-screen bg-background pb-16 md:pb-0">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/capture" component={Capture} />
          <Route path="/tasks" component={Tasks} />
          <Route path="/memory" component={Memory} />
          <Route path="/decisions" component={Decisions} />
          <Route path="/evening" component={Evening} />
          <Route path="/overload" component={Overload} />
          <Route path="/weekly" component={Weekly} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <QuickCapture />
    </div>
  );
}

import Dashboard from "./pages/dashboard";
import Capture from "./pages/capture";
import Tasks from "./pages/tasks";
import Memory from "./pages/memory";
import Decisions from "./pages/decisions";
import Evening from "./pages/evening";
import Overload from "./pages/overload";
import Weekly from "./pages/weekly";
import SettingsPage from "./pages/settings";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LoginGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <SidebarProvider>
              <Router />
            </SidebarProvider>
          </WouterRouter>
        </LoginGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
