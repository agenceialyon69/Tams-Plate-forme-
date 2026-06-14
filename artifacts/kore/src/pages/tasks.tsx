import { useListTasks, useUpdateTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks({ status: "pending" });
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  const handleToggle = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "pending" ? "done" : "pending";
    updateTask.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  const domainColors: Record<string, string> = {
    health: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    family: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    admin: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    work: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    projects: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  };

  return (
    <div className="p-8 md:p-12 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-serif mb-2 text-foreground">Tâches</h1>
        <p className="text-muted-foreground text-lg">Ce qui requiert votre attention.</p>
      </header>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))
        ) : tasks?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground italic">
            Aucune tâche en attente. Respirez.
          </div>
        ) : (
          tasks?.map((task, i) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={task.id}
              className="flex items-center gap-4 p-4 rounded-lg bg-card/50 border border-card-border hover:bg-card/80 transition-colors"
            >
              <Checkbox
                checked={task.status === "done"}
                onCheckedChange={() => handleToggle(task.id, task.status)}
                className="w-5 h-5 rounded-full border-muted-foreground data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-base truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground/90'}`}>
                  {task.title}
                </p>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(task.dueDate), "d MMM", { locale: fr })}
                  </p>
                )}
              </div>
              {task.priorityDomain && (
                <Badge variant="outline" className={`font-normal ${domainColors[task.priorityDomain] || 'bg-muted text-muted-foreground'}`}>
                  {task.priorityDomain}
                </Badge>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
