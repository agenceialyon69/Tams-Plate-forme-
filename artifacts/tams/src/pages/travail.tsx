import { useState } from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useListProjects, useCreateProject, useUpdateProject, useDeleteProject,
  useListContacts, useCreateContact, useUpdateContact, useDeleteContact,
  getListTasksQueryKey, getListProjectsQueryKey, getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, CheckSquare, FolderOpen, Users, Check, Circle, Trash2, X, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "taches" | "projets" | "contacts";

const priorityColor: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/10",
  high: "text-amber-400 bg-amber-500/10",
  medium: "text-blue-400 bg-blue-500/10",
  low: "text-muted-foreground bg-secondary",
};

const statusColor: Record<string, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-blue-400",
  done: "text-emerald-400",
  cancelled: "text-red-400 line-through",
};

const contactStatusColor: Record<string, string> = {
  prospect: "text-amber-400 bg-amber-500/10",
  active: "text-blue-400 bg-blue-500/10",
  client: "text-emerald-400 bg-emerald-500/10",
  inactive: "text-muted-foreground bg-secondary",
};

const contactStatusLabel: Record<string, string> = {
  prospect: "Prospect",
  active: "Actif",
  client: "Client",
  inactive: "Inactif",
};

export default function Travail() {
  const [tab, setTab] = useState<Tab>("taches");
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const tabs = [
    { id: "taches" as Tab, label: "Tâches", icon: CheckSquare },
    { id: "projets" as Tab, label: "Projets", icon: FolderOpen },
    { id: "contacts" as Tab, label: "Contacts", icon: Users },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Travail</h1>
          <button
            data-testid="button-add-item"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau
          </button>
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => { setTab(t.id); setShowForm(false); }}
              className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all duration-150", tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 md:pb-6">
        {tab === "taches" && <TasksTab showForm={showForm} onCloseForm={() => setShowForm(false)} />}
        {tab === "projets" && <ProjectsTab showForm={showForm} onCloseForm={() => setShowForm(false)} />}
        {tab === "contacts" && <ContactsTab showForm={showForm} onCloseForm={() => setShowForm(false)} />}
      </div>
    </div>
  );
}

function TasksTab({ showForm, onCloseForm }: { showForm: boolean; onCloseForm: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks = [], isLoading } = useListTasks();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [filter, setFilter] = useState<string>("all");

  const create = useCreateTask({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTasksQueryKey() }); setTitle(""); onCloseForm(); toast({ title: "Tâche créée" }); } } });
  const update = useUpdateTask({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() }) } });
  const del = useDeleteTask({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTasksQueryKey() }); toast({ title: "Tâche supprimée" }); } } });

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter || t.priority === filter);

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {[
          { v: "all", l: "Toutes" }, { v: "todo", l: "À faire" }, { v: "in_progress", l: "En cours" },
          { v: "done", l: "Terminées" }, { v: "urgent", l: "Urgentes" }
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)} className={cn("px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-colors", filter === f.v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
            {f.l}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-3">
          <input
            data-testid="input-task-title"
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Titre de la tâche..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && title.trim()) create.mutate({ data: { title: title.trim(), priority: priority as any } }); }}
          />
          <div className="flex flex-wrap gap-1.5">
            {["low", "medium", "high", "urgent"].map(p => (
              <button key={p} onClick={() => setPriority(p)} className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", priority === p ? priorityColor[p] : "bg-secondary text-muted-foreground")}>
                {p === "low" ? "Bas" : p === "medium" ? "Moyen" : p === "high" ? "Haut" : "Urgent"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button data-testid="button-cancel-task" onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">Annuler</button>
            <button data-testid="button-save-task" disabled={!title.trim() || create.isPending} onClick={() => create.mutate({ data: { title: title.trim(), priority: priority as any } })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">
              Créer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-card rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucune tâche</div>
      ) : (
        <div className="space-y-1.5 stagger">
          {filtered.map(task => (
            <div key={task.id} data-testid={`task-item-${task.id}`} className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:border-border/80 transition-colors group">
              <button
                data-testid={`button-toggle-task-${task.id}`}
                onClick={() => update.mutate({ id: task.id, data: { status: task.status === "done" ? "todo" : "done" } })}
                className="shrink-0 transition-colors"
              >
                {task.status === "done" ? <Check className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-medium truncate", statusColor[task.status])}>{task.title}</div>
                {task.projectName && <div className="text-xs text-muted-foreground">{task.projectName}</div>}
              </div>
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0", priorityColor[task.priority])}>
                {task.priority === "urgent" ? "Urgent" : task.priority === "high" ? "Haut" : task.priority === "medium" ? "Moyen" : "Bas"}
              </span>
              <button data-testid={`button-delete-task-${task.id}`} onClick={() => del.mutate({ id: task.id })} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsTab({ showForm, onCloseForm }: { showForm: boolean; onCloseForm: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useListProjects();
  const [name, setName] = useState("");

  const create = useCreateProject({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setName(""); onCloseForm(); toast({ title: "Projet créé" }); } } });
  const update = useUpdateProject({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }) } });
  const del = useDeleteProject({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }); toast({ title: "Projet supprimé" }); } } });

  const projectStatusLabel: Record<string, string> = { active: "Actif", paused: "En pause", completed: "Terminé", archived: "Archivé" };
  const projectStatusColor: Record<string, string> = { active: "text-emerald-400 bg-emerald-500/10", paused: "text-amber-400 bg-amber-500/10", completed: "text-blue-400 bg-blue-500/10", archived: "text-muted-foreground bg-secondary" };

  return (
    <div className="space-y-3">
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in">
          <input
            data-testid="input-project-name"
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring mb-3"
            placeholder="Nom du projet..."
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground">Annuler</button>
            <button data-testid="button-save-project" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ data: { name: name.trim() } })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Créer</button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucun projet</div>
      ) : (
        <div className="space-y-2 stagger">
          {projects.map(p => (
            <div key={p.id} data-testid={`project-item-${p.id}`} className="bg-card border border-card-border rounded-xl p-4 group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{p.name}</div>
                  {p.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", projectStatusColor[p.status])}>{projectStatusLabel[p.status]}</span>
                  <button data-testid={`button-delete-project-${p.id}`} onClick={() => del.mutate({ id: p.id })} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{p.completedTaskCount}/{p.taskCount} tâches</span>
                  <span className="text-xs text-muted-foreground">{p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0}%</span>
                </div>
                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${p.taskCount > 0 ? (p.completedTaskCount / p.taskCount) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactsTab({ showForm, onCloseForm }: { showForm: boolean; onCloseForm: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: contacts = [], isLoading } = useListContacts();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("prospect");

  const create = useCreateContact({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListContactsQueryKey() }); setName(""); setCompany(""); onCloseForm(); toast({ title: "Contact créé" }); } } });
  const update = useUpdateContact({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListContactsQueryKey() }) } });
  const del = useDeleteContact({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListContactsQueryKey() }); toast({ title: "Contact supprimé" }); } } });

  return (
    <div className="space-y-3">
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in space-y-2">
          <input data-testid="input-contact-name" autoFocus className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Nom..." value={name} onChange={e => setName(e.target.value)} />
          <input data-testid="input-contact-company" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring" placeholder="Entreprise..." value={company} onChange={e => setCompany(e.target.value)} />
          <div className="flex gap-1 flex-wrap">
            {["prospect", "active", "client"].map(s => (
              <button key={s} onClick={() => setStatus(s)} className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors", status === s ? contactStatusColor[s] : "bg-secondary text-muted-foreground")}>{contactStatusLabel[s]}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground">Annuler</button>
            <button data-testid="button-save-contact" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ data: { name: name.trim(), company: company.trim() || undefined, status: status as any } })} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">Créer</button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucun contact</div>
      ) : (
        <div className="space-y-1.5 stagger">
          {contacts.map(c => (
            <div key={c.id} data-testid={`contact-item-${c.id}`} className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 group">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-primary">{c.name[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{c.name}</div>
                {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
              </div>
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0", contactStatusColor[c.status])}>{contactStatusLabel[c.status]}</span>
              <button data-testid={`button-delete-contact-${c.id}`} onClick={() => del.mutate({ id: c.id })} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive text-muted-foreground transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
