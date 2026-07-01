import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav, Sidebar } from "@/components/navigation";
import { ErrorBoundary } from "@/components/error-boundary";

const Accueil = lazy(() => import("@/pages/accueil"));
const Chat = lazy(() => import("@/pages/chat"));
const Agents = lazy(() => import("@/pages/agents"));
const Travail = lazy(() => import("@/pages/travail"));
const Vie = lazy(() => import("@/pages/vie"));
const Studio = lazy(() => import("@/pages/studio"));
const Systeme = lazy(() => import("@/pages/systeme"));
const Capabilities = lazy(() => import("@/pages/capabilities"));
const NotFound = lazy(() => import("@/pages/not-found"));

function LoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px]">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  // Clé = route courante : chaque navigation réinitialise l'ErrorBoundary,
  // donc une page plantée n'enferme pas l'utilisateur (il peut changer d'onglet).
  const [location] = useLocation();
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ErrorBoundary key={location}>
        <Switch>
          <Route path="/" component={Accueil} />
          <Route path="/chat" component={Chat} />
          <Route path="/agents" component={Agents} />
          <Route path="/travail" component={Travail} />
          <Route path="/vie" component={Vie} />
          <Route path="/studio" component={Studio} />
          <Route path="/systeme" component={Systeme} />
          <Route path="/capabilities" component={Capabilities} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Suspense>
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
              style={{
                // Safe-area iPhone (Dynamic Island / encoche / coins) : sans
                // paddingTop, les en-têtes de page passent SOUS la status bar
                // → contenu "débordé". On respecte les 4 insets.
                paddingTop: "env(safe-area-inset-top)",
                paddingRight: "env(safe-area-inset-right)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
              }}
            >
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