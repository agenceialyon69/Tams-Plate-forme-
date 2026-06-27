import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav, Sidebar } from "@/components/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import Accueil from "@/pages/accueil";
import Chat from "@/pages/chat";
import Agents from "@/pages/agents";
import Travail from "@/pages/travail";
import Studio from "@/pages/studio";
import Systeme from "@/pages/systeme";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Accueil} />
      <Route path="/chat" component={Chat} />
      <Route path="/agents" component={Agents} />
      <Route path="/travail" component={Travail} />
      <Route path="/studio" component={Studio} />
      <Route path="/systeme" component={Systeme} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {/* dvh = dynamic viewport height — correct on iOS Safari with keyboard */}
          <div className="flex overflow-hidden bg-background" style={{ height: "100dvh" }}>
            <Sidebar />
            <main
              className="flex-1 flex flex-col overflow-hidden"
              style={{ paddingRight: "env(safe-area-inset-right)" }}
            >
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </main>
          </div>
          <BottomNav />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
