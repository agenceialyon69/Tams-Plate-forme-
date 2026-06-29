import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import SecurityPage from "@/pages/Security";
import ChiefOfStaff from "@/pages/ChiefOfStaff";
import MemoryGraph from "@/pages/MemoryGraph";
import OpsWatcher from "@/pages/OpsWatcher";
import Studio from "@/pages/Studio";
import ActionHub from "@/pages/ActionHub";
import ChatPage from "@/pages/Chat";
import AgentsPage from "@/pages/Agents";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/security" component={SecurityPage} />
          <Route path="/cos" component={ChiefOfStaff} />
          <Route path="/memory" component={MemoryGraph} />
          <Route path="/ops" component={OpsWatcher} />
          <Route path="/studio" component={Studio} />
          <Route path="/actions" component={ActionHub} />
          <Route path="/chat" component={ChatPage} />
          <Route path="/agents" component={AgentsPage} />
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

export default App;
