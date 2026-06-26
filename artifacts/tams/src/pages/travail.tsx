import { useState } from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useListProjects, useCreateProject, useUpdateProject, useDeleteProject,
  useListContacts, useCreateContact, useUpdateContact, useDeleteContact,
  getListTasksQueryKey, getListProjectsQueryKey, getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, CheckSquare, FolderOpen, Users, Check, Circle, Trash2, List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "taches" | "projets" | "contacts";

const priorityColor: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/10",
  high:   "text-amber-400 bg-amber-500/10",
  medium: "text-blue-400 bg-blue-500/10",
  low:    "text-muted-foreground bg-secondary",
};

const priorityLabel: Record<string, string> = {
  urgent: "Urgent", high: "Haut", medium: "Moyen", low: "Bas",
};

const statusColor: Record<string, string> = {
  todo:       "text-muted-foreground",
  in_progress:"text-blue-400",
  done:       "text-emerald-400",
  blocked:    "text-red-400",
  cancelled:  "text-red-400 line-through",
};

const contactStatusColor: Record<string, string> = {
  prospect: "text-amber-400 bg-amber-500/10",
  active:   "text-blue-400 bg-blue-500/10",
  client:   "text-emerald-400 bg-emerald-500/10",
  inactive: "text-muted-foreground bg-secondary",
};

const contactStatusLabel: Record<string, string> = {
  prospect: "Prospect", active: "Actif", client: "Client", inactive: "Inactif",
};

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Travail() {
  const [tab, setTab] = useState<Tab>("taches");
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const tabs = [
    { id: "taches"   as Tab, label: "Tâches",   icon: CheckSquare },
    { id: "projets"  as Tab, label: "Projets",  icon: FolderOpen },
    { id: "contacts" as Tab, label: "Contacts", icon: Users },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Travail</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            {tab === "taches" ? "Tâche" : tab === "projets" ? "Projet" : "Contact"}
          </button>
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setShowForm(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 pb-28 md:pb-6 flex flex-col">
        {tab === "taches"   && <TasksTab showForm={showForm} onCloseForm={() => setShowForm(false)} />}
        {tab === "projets"  && <ProjectsTab showForm={showForm} onCloseForm={() => setShowForm(false)} />}
        {tab === "contacts" && <ContactsTab showForm={showForm} onCloseForm={() => setShowForm(false)} />}
      </div>
    </div>
  );
}

// ─── Tasks Tab ─────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { status: "todo",        label: "À faire",   dotColor: "bg-muted-foreground" },
  { status: "in_progress", label: "En cours",  dotColor: "bg-blue-500" },
  { status: "done",        label: "Terminé",   dotColor: "bg-emerald-500" },
  { status: "blocked",     label: "Bloqué",    dotColor: "bg-red-500" },
] as const;

const STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress", in_progress: "done", done: "blocked", blocked: "todo",
};

function TasksTab({ showForm, onCloseForm }: { showForm: boolean; onCloseForm: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks = [], isLoading } = useListTasks();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("list");

  const create = useCreateTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setTitle(""); onCloseForm();
        toast({ title: "Tâche créée" });
      },
    },
  });
  const update = useUpdateTask({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() }) },
  });
  const del = useDeleteTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Tâche supprimée" });
      },
    },
  });

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter || t.priority === filter);

  return (
    <div className="flex-1 flex flex-col overflow-hidden space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2 items-center shrink-0">
        <div className="flex gap-1.5 flex-1 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { v: "all", l: "Toutes" }, { v: "todo", l: "À faire" }, { v: "in_progress", l: "En cours" },
            { v: "done", l: "Terminées" }, { v: "urgent", l: "Urgentes" },
          ].map(f => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors",
                filter === f.v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
        {/* View toggle */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1 shrink-0">
          <button
            onClick={() => setView("list")}
            className={cn("p-1.5 rounded-md transition-all", view === "list" ? "bg-background text-foreground" : "text-muted-foreground")}
            title="Vue liste"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView("kanban")}
            className={cn("p-1.5 rounded-md transition-all", view === "kanban" ? "bg-background text-foreground" : "text-muted-foreground")}
            title="Vue Kanban"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3 shrink-0">
          <input
            data-testid="input-task-title"
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Titre de la tâche..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && title.trim())
                create.mutate({ data: { title: title.trim(), priority: priority as any } });
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {["low", "medium", "high", "urgent"].map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  priority === p ? priorityColor[p] : "bg-secondary text-muted-foreground"
                )}
              >
                {priorityLabel[p]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button data-testid="button-cancel-task" onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">
              Annuler
            </button>
            <button
              data-testid="button-save-task"
              disabled={!title.trim() || create.isPending}
              onClick={() => create.mutate({ data: { title: title.trim(), priority: priority as any } })}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 shrink-0">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : view === "list" ? (
        <TaskListView tasks={filtered} onUpdate={update} onDelete={del} />
      ) : (
        <TaskKanbanView tasks={tasks} onUpdate={update} onDelete={del} />
      )}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function TaskListView({ tasks, onUpdate, onDelete }: {
  tasks: any[];
  onUpdate: any;
  onDelete: any;
}) {
  if (tasks.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Aucune tâche</div>;
  }
  return (
    <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 stagger">
      {tasks.map(task => (
        <div
          key={task.id}
          data-testid={`task-item-${task.id}`}
          className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:border-border/80 transition-colors group"
        >
          <button
            data-testid={`button-toggle-task-${task.id}`}
            onClick={() => onUpdate.mutate({ id: task.id, data: { status: task.status === "done" ? "todo" : "done" } })}
            className="shrink-0 transition-colors"
          >
            {task.status === "done"
              ? <Check className="w-4 h-4 text-emerald-400" />
              : <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className={cn("text-sm font-medium truncate", statusColor[task.status])}>{task.title}</div>
            {task.projectName && <div className="text-xs text-muted-foreground">{task.projectName}</div>}
          </div>
          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0", priorityColor[task.priority])}>
            {priorityLabel[task.priority]}
          </span>
          <button
            data-testid={`button-delete-task-${task.id}`}
            onClick={() => onDelete.mutate({ id: task.id })}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Kanban View ──────────────────────────────────────────────────────────────

function TaskKanbanView({ tasks, onUpdate, onDelete }: {
  tasks: any[];
  onUpdate: any;
  onDelete: any;
}) {
  const activeTasks = tasks.filter(t => t.status !== "cancelled");

  return (
    <div className="flex-1 overflow-x-auto min-h-0">
      <div className="flex gap-3 h-full min-w-max pb-2">
        {KANBAN_COLUMNS.map(col => {
          const colTasks = activeTasks.filter(t => t.status === col.status);
          return (
            <div key={col.status} className="flex flex-col w-[220px] md:w-[240px] shrink-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className={cn("w-2 h-2 rounded-full shrink-0", col.dotColor)} />
                <span className="text-xs font-semibold text-foreground">{col.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>
              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5">
                {colTasks.length === 0 ? (
                  <div className="h-16 border-2 border-dashed border-border/40 rounded-xl flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground/50">Vide</span>
                  </div>
                ) : (
                  colTasks.map(task => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onMove={status => onUpdate.mutate({ id: task.id, data: { status } })}
                      onDelete={() => onDelete.mutate({ id: task.id })}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ task, onMove, onDelete }: {
  task: any;
  onMove: (status: string) => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="bg-card border border-card-border rounded-xl p-3 space-y-2 hover:border-border/80 transition-colors group relative"
      onClick={() => setShowActions(s => !s)}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground leading-snug">{task.title}</div>
          {task.projectName && (
            <div className="text-[10px] text-muted-foreground mt-0.5">{task.projectName}</div>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full", priorityColor[task.priority])}>
          {priorityLabel[task.priority]}
        </span>
        {/* Quick status cycle */}
        <button
          onClick={e => { e.stopPropagation(); onMove(STATUS_CYCLE[task.status] ?? "todo"); }}
          className="text-[9px] text-muted-foreground hover:text-foreground bg-secondary px-1.5 py-0.5 rounded-full transition-colors"
          title="Avancer le statut"
        >
          →
        </button>
      </div>

      {/* Status picker (expanded on tap) */}
      {showActions && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-popover-border rounded-xl shadow-lg p-2 space-y-1 z-10"
          onClick={e => e.stopPropagation()}
        >
          {KANBAN_COLUMNS.map(col => (
            <button
              key={col.status}
              onClick={() => { onMove(col.status); setShowActions(false); }}
              className={cn(
                "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                task.status === col.status
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", col.dotColor)} />
              {col.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Projects Tab ─────────────────────────────────────────────────────────────

function ProjectsTab({ showForm, onCloseForm }: { showForm: boolean; onCloseForm: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useListProjects();
  const [name, setName] = useState("");

  const create = useCreateProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setName(""); onCloseForm();
        toast({ title: "Projet créé" });
      },
    },
  });
  const update = useUpdateProject({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }) } });
  const del = useDeleteProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Projet supprimé" });
      },
    },
  });

  const projectStatusLabel: Record<string, string> = {
    active: "Actif", paused: "En pause", completed: "Terminé", archived: "Archivé",
  };
  const projectStatusColor: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-500/10",
    paused: "text-amber-400 bg-amber-500/10",
    completed: "text-blue-400 bg-blue-500/10",
    archived: "text-muted-foreground bg-secondary",
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in shrink-0">
          <input
            data-testid="input-project-name"
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring mb-3"
            placeholder="Nom du projet..."
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">
              Annuler
            </button>
            <button
              data-testid="button-save-project"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ data: { name: name.trim() } })}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucun projet</div>
      ) : (
        <div className="space-y-2 stagger">
          {projects.map(proj => (
            <div key={proj.id} data-testid={`project-item-${proj.id}`} className="bg-card border border-card-border rounded-xl px-4 py-3 flex items-center gap-3 group hover:border-border/80 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{proj.name}</div>
                {proj.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{proj.description}</div>}
              </div>
              <button
                onClick={() => update.mutate({
                  id: proj.id,
                  data: { status: proj.status === "active" ? "paused" : proj.status === "paused" ? "completed" : "active" },
                })}
                className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors cursor-pointer", projectStatusColor[proj.status])}
              >
                {projectStatusLabel[proj.status] ?? proj.status}
              </button>
              <button
                data-testid={`button-delete-project-${proj.id}`}
                onClick={() => del.mutate({ id: proj.id })}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────────────────────

function ContactsTab({ showForm, onCloseForm }: { showForm: boolean; onCloseForm: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: contacts = [], isLoading } = useListContacts();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("prospect");

  const create = useCreateContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        setName(""); setCompany(""); setEmail(""); onCloseForm();
        toast({ title: "Contact créé" });
      },
    },
  });
  const update = useUpdateContact({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListContactsQueryKey() }) } });
  const del = useDeleteContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        toast({ title: "Contact supprimé" });
      },
    },
  });

  return (
    <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3 shrink-0">
          <input
            data-testid="input-contact-name"
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Nom *"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="Entreprise"
              value={company}
              onChange={e => setCompany(e.target.value)}
            />
            <input
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {["prospect", "active", "client", "inactive"].map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn("flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors",
                  status === s ? contactStatusColor[s] : "bg-secondary text-muted-foreground"
                )}
              >
                {contactStatusLabel[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">
              Annuler
            </button>
            <button
              data-testid="button-save-contact"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ data: { name: name.trim(), company: company || undefined, email: email || undefined, status: status as any } })}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-card rounded-xl animate-pulse" />)}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucun contact</div>
      ) : (
        <div className="space-y-1.5 stagger">
          {contacts.map(contact => (
            <div key={contact.id} data-testid={`contact-item-${contact.id}`} className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:border-border/80 transition-colors group">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{contact.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[contact.company, contact.email].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                onClick={() => {
                  const cycle: Record<string, string> = { prospect: "active", active: "client", client: "inactive", inactive: "prospect" };
                  update.mutate({ id: contact.id, data: { status: (cycle[contact.status] ?? "prospect") as any } });
                }}
                className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors cursor-pointer", contactStatusColor[contact.status])}
              >
                {contactStatusLabel[contact.status] ?? contact.status}
              </button>
              <button
                data-testid={`button-delete-contact-${contact.id}`}
                onClick={() => del.mutate({ id: contact.id })}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
