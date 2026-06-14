import { useGetMorningBriefing, getGetMorningBriefingQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function Dashboard() {
  const { data: briefing, isLoading } = useGetMorningBriefing();

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const isOverloaded = briefing?.estimatedLoad === 'critical' || briefing?.estimatedLoad === 'heavy';

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto space-y-12">
      <header>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl font-serif mb-2 text-foreground">
            {format(new Date(), "EEEE d MMMM", { locale: fr })}
          </h1>
          <p className="text-muted-foreground text-lg">
            {briefing?.koreMessage || "Bonjour. Prenons le temps de nous recentrer."}
          </p>
        </motion.div>
      </header>

      {briefing?.overloadAlert && isOverloaded && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 flex gap-4 items-start">
            <AlertTriangle className="w-6 h-6 text-destructive shrink-0" />
            <div>
              <h3 className="text-destructive font-medium text-lg mb-1">Attention requise</h3>
              <p className="text-destructive/80">{briefing.overloadAlert}</p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-card border-card-border h-full shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-xl">
                <CheckCircle2 className="w-5 h-5 text-accent" />
                Priorités du jour
              </CardTitle>
            </CardHeader>
            <CardContent>
              {briefing?.topPriorities?.length ? (
                <ul className="space-y-4">
                  {briefing.topPriorities.map((priority, i) => (
                    <li key={i} className="flex gap-3 text-foreground/90">
                      <span className="text-accent text-sm mt-1">{i + 1}.</span>
                      <span>{priority}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic">Aucune priorité définie pour aujourd'hui.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="bg-card border-card-border h-full shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif font-normal text-xl">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Événements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {briefing?.todayEvents?.length ? (
                <ul className="space-y-4">
                  {briefing.todayEvents.map((event) => (
                    <li key={event.id} className="flex gap-4">
                      <span className="text-muted-foreground w-12 shrink-0">{event.eventTime || "All"}</span>
                      <span className="text-foreground/90">{event.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic">Aucun événement prévu aujourd'hui.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
