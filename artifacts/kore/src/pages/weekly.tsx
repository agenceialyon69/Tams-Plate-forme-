import { useQuery } from "@tanstack/react-query";
import { useGetEnergyHistory, getGetEnergyHistoryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, Zap, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { format, subDays, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

export default function Weekly() {
  const { data: energyHistory, isLoading: isEnergyLoading } = useGetEnergyHistory();

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["weekly-summary"],
    queryFn: async () => {
      const res = await fetch("/api/briefings/weekly");
      if (!res.ok) throw new Error("Failed to fetch weekly summary");
      return res.json();
    },
    staleTime: 1800_000,
  });

  const weeklyEnergyData = (() => {
    const days: { date: string; label: string; energy: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = d.toISOString().split("T")[0];
      const log = energyHistory?.find((l) => l.logDate === dateStr);
      days.push({
        date: dateStr,
        label: format(d, "EEE", { locale: fr }),
        energy: log ? log.level : null,
      });
    }
    return days;
  })();

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="p-8 md:p-12 max-w-4xl mx-auto space-y-10 min-h-screen">
      <header>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-serif mb-2 text-foreground">Bilan de la semaine</h1>
          <p className="text-muted-foreground text-lg">
            {format(weekStart, "d MMMM", { locale: fr })} — {format(weekEnd, "d MMMM yyyy", { locale: fr })}
          </p>
        </motion.div>
      </header>

      {isSummaryLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : summary ? (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
          <motion.div variants={item}>
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-8">
                <p className="text-foreground/90 text-lg leading-relaxed font-serif">{summary.koreMessage}</p>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div variants={item}>
              <Card className="bg-card border-border shadow-sm h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                    <TrendingUp className="w-4 h-4 text-accent" />
                    Tendance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{summary.trend}</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="bg-card border-border shadow-sm h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
                    <AlertCircle className="w-4 h-4 text-accent" />
                    Pour la semaine prochaine
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{summary.recommendation}</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Tâches terminées", value: summary.tasksCompleted, icon: CheckCircle2, color: "text-emerald-500" },
              { label: "En retard", value: summary.tasksOverdue, icon: AlertCircle, color: "text-amber-500" },
              { label: "Décisions", value: summary.decisionsCount, icon: BarChart2, color: "text-accent" },
              { label: "Revues du soir", value: `${summary.reviewsCount}/7`, icon: Zap, color: "text-blue-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="bg-card border-border shadow-sm">
                <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-2">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        </motion.div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground italic">Impossible de charger le bilan. Réessaie dans un moment.</p>
          </CardContent>
        </Card>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-4">
        <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Énergie cette semaine
        </h2>
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-6">
            {isEnergyLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : weeklyEnergyData.some((d) => d.energy !== null) ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyEnergyData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 10]} stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} ticks={[0, 5, 10]} />
                    <ReferenceLine y={5} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" opacity={0.4} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "8px" }}
                      itemStyle={{ color: "var(--color-foreground)" }}
                      formatter={(v: number) => [`${v}/10`, "Énergie"]}
                    />
                    <Bar dataKey="energy" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center">
                <p className="text-muted-foreground italic text-sm">
                  Aucune énergie loggée cette semaine. Note-la chaque soir dans la Revue du soir.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
