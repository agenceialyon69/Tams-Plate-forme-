import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Compass, CheckCircle2, BrainCircuit, Activity, MoonStar, Home, Mic, BarChart2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { QuickCapture } from "@/components/QuickCapture";

const queryClient = new QueryClient();

// Lazy load pages for brevity in App.tsx (or import them directly)
import Dashboard from "./pages/dashboard";
import Capture from "./pages/capture";
import Tasks from "./pages/tasks";
import Memory from "./pages/memory";
import Decisions from "./pages/decisions";
import Evening from "./pages/evening";
import Overload from "./pages/overload";
import Weekly from "./pages/weekly";

function AppSidebar() {
  const [location] = useLocation();
  
  const navItems = [
    { href: "/", label: "Aperçu", icon: Home },
    { href: "/capture", label: "Capture", icon: Mic },
    { href: "/tasks", label: "Tâches", icon: CheckCircle2 },
    { href: "/memory", label: "Mémoire", icon: BrainCircuit },
    { href: "/decisions", label: "Décisions", icon: Compass },
    { href: "/evening", label: "Revue", icon: MoonStar },
    { href: "/overload", label: "Bien-être", icon: Activity },
    { href: "/weekly", label: "Bilan", icon: BarChart2 },
  ];

  return (
    <>
      <div className="hidden md:flex">
        <Sidebar>
          <SidebarHeader className="py-6 px-4">
            <div className="flex items-center gap-2 px-2">
              <div className="w-4 h-4 rounded-full bg-accent" />
              <h1 className="font-serif text-xl tracking-tight text-foreground font-semibold">KORE</h1>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location === item.href}>
                    <Link href={item.href} className="flex items-center gap-3 px-4 py-2">
                      <item.icon className="w-4 h-4 opacity-70" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            
            <div className="mt-auto p-6">
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">Boussole</h3>
                {['Santé', 'Famille', 'Administratif', 'Travail', 'Projets', 'Productivité'].map((domain, i) => (
                  <div key={domain} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    <span className={i === 0 ? "text-foreground" : ""}>{domain}</span>
                  </div>
                ))}
              </div>
            </div>
          </SidebarContent>
        </Sidebar>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-center justify-around pb-safe">
        {navItems.slice(0, 5).map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center py-3 px-4 flex-1 ${isActive ? 'text-accent' : 'text-muted-foreground'}`}>
              <item.icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">{item.label}</span>
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
          <Route component={NotFound} />
        </Switch>
      </main>
      <QuickCapture />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SidebarProvider>
            <Router />
          </SidebarProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
