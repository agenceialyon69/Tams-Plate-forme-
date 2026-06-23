import { useGetOverloadStatus, useGetEnergyHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertTriangle, ShieldCheck, Zap } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Overload() {
  const { data: status, isLoading: isStatusLoading } = useGetOverloadStatus();
  const { data: energyHistory, isLoading: isHistoryLoading } = useGetEnergyHistory();

  const getRiskColor = (level?: string) => {
    switch(level) {
      case 'critical': return 'text-destructive border-destructive bg-destructive/10';
      case 'high': return 'text-orange-500 border-orange-500 bg-orange-500/10';
      case 'medium': return 'text-amber-500 border-amber-500 bg-amber-500/10';
      case 'low': return 'text-blue-500 border-blue-500 bg-blue-500/10';
      case 'none': return 'text-emerald-500 border-emerald-500 bg-emerald-500/10';
      default: return 'text-muted-foreground border-border bg-card';
    }
  };

  const getRiskIcon = (level?: string) => {
    if (level === 'critical' || level === 'high') return <AlertTriangle className="w-8 h-8" />;
    return <ShieldCheck className="w-8 h-8" />;
  };

  const chartData = energyHistory?.map(log => ({
    date: format(parseISO(log.logDate), "dd/MM"),
    energy: log.level
  })).reverse() || [];

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto space-y-12 min-h-screen">
      <PageHeader
        icon={Activity}
        title="Bien-être & Charge"
        subtitle="L'objectif n'est pas de faire plus, mais de durer."
        className="mb-2"
      />

      {isStatusLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : status ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className={`p-8 rounded-2xl border-2 flex flex-col md:flex-row items-center gap-8 ${getRiskColor(status.riskLevel)}`}>
            <div className="shrink-0 p-4 bg-background/50 rounded-full mix-blend-overlay">
              {getRiskIcon(status.riskLevel)}
            </div>
            <div className="space-y-4 flex-1">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">
                  Niveau de risque: {status.riskLevel}
                </p>
                {status.suggestion && (
                  <h3 className="text-2xl font-serif leading-snug">
                    {status.suggestion}
                  </h3>
                )}
              </div>
              
              {status.alerts && status.alerts.length > 0 && (
                <ul className="space-y-2 opacity-90">
                  {status.alerts.map((alert, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {alert}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="shrink-0 flex gap-6 md:border-l border-current/20 md:pl-8 py-4">
              <div className="text-center">
                <p className="text-3xl font-mono font-bold">{status.consecutiveWorkDays}</p>
                <p className="text-xs uppercase tracking-wider opacity-70 mt-1">Jours consécutifs</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold">{status.activeTasks}</p>
                <p className="text-xs uppercase tracking-wider opacity-70 mt-1">Tâches actives</p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}

      <div className="space-y-6">
        <h2 className="text-xl font-serif text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Énergie sur 30 jours
        </h2>
        <Card className="bg-card border-card-border shadow-sm">
          <CardContent className="p-6">
            {isHistoryLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--color-muted-foreground)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      domain={[0, 10]} 
                      stroke="var(--color-muted-foreground)" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--color-foreground)' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="energy" 
                      stroke="var(--color-accent)" 
                      strokeWidth={3}
                      dot={{ fill: 'var(--color-accent)', r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground italic">
                Pas assez de données pour afficher le graphique.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
