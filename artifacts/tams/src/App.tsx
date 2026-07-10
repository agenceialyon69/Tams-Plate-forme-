import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppShell } from "@/components/layout/AppShell";

const Accueil = lazy(() => import("@/pages/accueil"));
const Chat = lazy(() => import("@/pages/chat"));
const Capture = lazy(() => import("@/pages/capture"));
const Travail = lazy(() => import("@/pages/travail"));
const Vie = lazy(() => import("@/pages/vie"));
const Studio = lazy(() => import("@/pages/studio"));
const Systeme = lazy(() => import("@/pages/systeme"));
const Capabilities = lazy(() => import("@/pages/capabilities"));
const DevAgentPro = lazy(() => import("@/pages/dev-agent-pro"));
const MonAgent = lazy(() => import("@/pages/mon-agent"));
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
  const [location] = useLocation();
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ErrorBoundary key={location}>
        <Switch>
          <Route path="/" component={Accueil} />
          <Route path="/today" component={Accueil} />
          <Route path="/chat" component={Chat} />
          <Route path="/capture" component={Capture} />
          <Route path="/travail" component={Travail} />
          <Route path="/dossiers" component={Travail} />
          <Route path="/vie" component={Vie} />
          <Route path="/memory" component={Systeme} />
          <Route path="/studio" component={Studio} />
          <Route path="/systeme" component={Systeme} />
          <Route path="/capabilities" component={Capabilities} />
          <Route path="/dev-agent-pro" component={DevAgentPro} />
          <Route path="/mon-agent" component={MonAgent} />
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
          <AppShell>
            <Router />
          </AppShell>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
