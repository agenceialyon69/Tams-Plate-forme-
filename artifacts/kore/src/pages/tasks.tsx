import { useListTasks, useUpdateTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useState } from "react";
import { isBefore, startOfDay } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const domainColors: Record<string, string> = {
  health: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  family: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  admin: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  work: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  projects: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  personal: "bg-pink-500/10 text-pink-500 border-pink-500/20",
};

const domainLabels: Record<string, string> = {
  health: "Santé",
  family: "Famille",
  admin: "Admin",
  work: "Travail",
  projects: "Projets",
  personal: "Personnel",
};

export default function Tasks() {
  const [domain, setDomain] = useState<string>("all");
  const { data: tasks, isLoading } = useListTasks({ status: "pending" });
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  const handleToggle = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "pending" ? "done" : "pending";
    updateTask.mutate(
      { id, data: { status: newStatus as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      }
    );
  };

  const filtered = tasks?.filter((t) =>
    domain === "all" ? true : t.priorityDomain === domain
  );

  const overdue = filtered?.filter((t) => {
    if (!t.dueDate) return false;
    return isBefore(startOfDay(new Date(t.dueDate)), startOfDay(new Date()));
  });

  const upcoming = filtered?.filter((t) => {
    if (!t.dueDate) return true;
    return !isBefore(startOfDay(new Date(t.dueDate)), startOfDay(new Date()));
  });

  // Get unique domains from tasks for the filter tabs
  const availableDomains = tasks
    ? [...new Set(tasks.map((t) => t.priorityDomain).filter(Boolean))]
    : [];

  return (
    <div className="p-8 md:p-12 max-w-4xl mx-auto space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif mb-2 text-foreground">Tâches</h1>
          <p className="text-muted-foreground">
            {tasks?.length
              ? `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} en attente`
              : "Ce qui requiert ton attention."}
          </p>
        </div>
        {overdue && overdue.length > 0 && (
          <div className="flex items-center gap-1.5 text-amber-500 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{overdue.length} en retard</span>
          </div>
        )}
      </header>

      {availableDomains.length > 0 && (
        <Tabs value={domain} onValueChange={setDomain}>
          <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none h-auto p-0 gap-4">
            <TabsTrigger
              value="all"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none py-2 px-1 text-sm"
            >
              Tout
              {tasks && (
                <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {tasks.length}
                </span>
              )}
            </TabsTrigger>
            {availableDomains.map((d) => {
              const count = tasks?.filter((t) => t.priorityDomain === d).length || 0;
              return (
                <TabsTrigger
                  key={d}
                  value={d!}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none py-2 px-1 text-sm"
                >
                  {domainLabels[d!] || d}
                  {count > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}

      <div className="space-y-6">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))
        ) : filtered?.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto opacity-30" />
            <p className="text-muted-foreground italic">
              {domain === "all" ? "Aucune tâche en attente. Respirez." : "Aucune tâche dans ce domaine."}
            </p>
          </div>
        ) : (
          <>
            {overdue && overdue.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-3">
                  En retard
                </p>
                {overdue.map((task, i) => (
                  <TaskRow key={task.id} task={task} i={i} onToggle={handleToggle} isOverdue />
                ))}
              </div>
            )}

            {upcoming && upcoming.length > 0 && (
              <div className="space-y-2">
                {overdue && overdue.length > 0 && (
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-6 mb-3">
                    À venir
                  </p>
                )}
                {upcoming.map((task, i) => (
                  <TaskRow key={task.id} task={task} i={i} onToggle={handleToggle} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  i,
  onToggle,
  isOverdue,
}: {
  task: any;
  i: number;
  onToggle: (id: number, status: string) => void;
  isOverdue?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
        isOverdue
          ? "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10"
          : "bg-card/50 border-card-border hover:bg-card/80"
      }`}
    >
      <Checkbox
        checked={task.status === "done"}
        onCheckedChange={() => onToggle(task.id, task.status)}
        className="w-5 h-5 rounded-full border-muted-foreground data-[state=checked]:bg-accent data-[state=checked]:border-accent"
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-base truncate ${
            task.status === "done"
              ? "line-through text-muted-foreground"
              : "text-foreground/90"
          }`}
        >
          {task.title}
        </p>
        {task.dueDate && (
          <p className={`text-xs mt-0.5 ${isOverdue ? "text-amber-500" : "text-muted-foreground"}`}>
            {isOverdue ? "↳ " : ""}
            {format(new Date(task.dueDate), "d MMM", { locale: fr })}
          </p>
        )}
      </div>
      {task.priorityDomain && (
        <Badge
          variant="outline"
          className={`font-normal text-xs shrink-0 ${
            domainColors[task.priorityDomain] || "bg-muted text-muted-foreground"
          }`}
        >
          {domainLabels[task.priorityDomain] || task.priorityDomain}
        </Badge>
      )}
    </motion.div>
  );
}
