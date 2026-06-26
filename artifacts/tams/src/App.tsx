import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav, Sidebar } from "@/components/navigation";
import Accueil from "@/pages/accueil";
import Chat from "@/pages/chat";
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
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
              <Router />
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
