import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useListProjects, useCreateProject, useUpdateProject, useDeleteProject,
  useListContacts, useCreateContact, useUpdateContact, useDeleteContact,
  useGetTaskSuggestions, useAutoLinkTask,
  useGetProjectRelated, useGetProjectSuggestions, useAutoLinkProject,
  useGetContactRelated, useGetContactSuggestions, useAutoLinkContact,
  getListTasksQueryKey, getListProjectsQueryKey, getListContactsQueryKey,
  getGetTaskSuggestionsQueryKey, getGetProjectRelatedQueryKey,
  getGetProjectSuggestionsQueryKey, getGetContactRelatedQueryKey,
  getGetContactSuggestionsQueryKey,
} from "@workspace/api-client-react";
import type { Task, Project, Contact, TaskPriority, TaskStatus, ContactStatus, TaskUpdateStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, CheckSquare, FolderOpen, Users, Check, Circle, Trash2, List, LayoutGrid,
  Search, X, Filter, Calendar, Phone, Mail, ArrowRight, GripVertical,
  Clock, MoreHorizontal, Link2, Paperclip
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ─────────────────────────────────────────────────────────────────────────────
   Types & Constants
   ───────────────────────────────────────────────────────────────────────────── */

type Tab = "taches" | "projets" | "contacts";

const priorityColor: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/10 border-red-500/20",
  high:   "text-amber-400 bg-amber-500/10 border-amber-500/20",
  medium: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  low:    "text-muted-foreground bg-secondary border-transparent",
};

const priorityLabel: Record<string, string> = {
  urgent: "Urgent", high: "Haut", medium: "Moyen", low: "Bas",
};

const priorityDot: Record<string, string> = {
  urgent: "bg-red-500", high: "bg-amber-500", medium: "bg-blue-500", low: "bg-muted-foreground",
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

const KANBAN_COLUMNS = [
  { status: "todo",        label: "À faire",   dotColor: "bg-muted-foreground", borderColor: "border-muted-foreground/20", bgColor: "bg-muted-foreground/5" },
  { status: "in_progress", label: "En cours",  dotColor: "bg-blue-500",         borderColor: "border-blue-500/20",         bgColor: "bg-blue-500/5" },
  { status: "blocked",     label: "Bloqué",    dotColor: "bg-red-500",          borderColor: "border-red-500/20",          bgColor: "bg-red-500/5" },
  { status: "done",        label: "Terminé",   dotColor: "bg-emerald-500",      borderColor: "border-emerald-500/20",      bgColor: "bg-emerald-500/5" },
] as const;

const STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress", in_progress: "done", done: "blocked", blocked: "todo",
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────────────── */

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays}j`;
  if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)}sem`;
  return `il y a ${Math.floor(diffDays / 30)}mois`;
}

function formatDueDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}j en retard`;
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "demain";
  return `dans ${diffDays}j`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map(w => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-red-500/20 text-red-400",
    "bg-orange-500/20 text-orange-400",
    "bg-amber-500/20 text-amber-400",
    "bg-emerald-500/20 text-emerald-400",
    "bg-cyan-500/20 text-cyan-400",
    "bg-blue-500/20 text-blue-400",
    "bg-violet-500/20 text-violet-400",
    "bg-pink-500/20 text-pink-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ─────────────────────────────────────────────────────────────────────────────
   URL Query Params Helpers
   ───────────────────────────────────────────────────────────────────────────── */

function useQueryParams() {
  const getParam = useCallback((key: string): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }, []);

  const setParam = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
    window.history.replaceState({}, "", newUrl);
  }, []);

  return { getParam, setParam };
}

/* ─────────────────────────────────────────────────────────────────────────────
   PaginatedList
   ───────────────────────────────────────────────────────────────────────────── */

function PaginatedList<T>({ items, initial = 20, render }: { items: T[]; initial?: number; render: (item: T) => React.ReactNode }) {
  const [limit, setLimit] = useState(initial);
  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  return (
    <>
      {visible.map((item, i) => (
        <div key={i}>{render(item)}</div>
      ))}
      {items.length > limit && (
        <div className="flex justify-center py-2">
          <button
            onClick={() => setLimit(l => l + initial)}
            className="px-3 py-1.5 rounded-full bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Voir plus ({items.length - limit} restants)
          </button>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Confirm Dialog Hook
   ───────────────────────────────────────────────────────────────────────────── */

type ConfirmState = { open: boolean; title: string; description: string; onConfirm: () => void };

function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, title: "", description: "", onConfirm: () => {} });
  const openConfirm = useCallback((title: string, description: string, onConfirm: () => void) => {
    setState({ open: true, title, description, onConfirm });
  }, []);
  const closeConfirm = useCallback(() => setState(s => ({ ...s, open: false })), []);
  return { state, openConfirm, closeConfirm };
}

/* ═════════════════════════════════════════════════════════════════════════════
   ROOT COMPONENT
   ═════════════════════════════════════════════════════════════════════════════ */

export default function Travail() {
  const [tab, setTab] = useState<Tab>("taches");
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state: confirm, openConfirm, closeConfirm } = useConfirm();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: "taches"   as Tab, label: "Tâches",   icon: CheckSquare },
    { id: "projets"  as Tab, label: "Projets",  icon: FolderOpen },
    { id: "contacts" as Tab, label: "Contacts", icon: Users },
  ];

  // Focus search input when shown
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Keyboard shortcut: Cmd/Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in stagger-up">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Travail</h1>
          <div className="flex items-center gap-2">
            {/* Search Toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.98]",
                showSearch ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
              title="Rechercher (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5" />
              {showSearch ? "Fermer" : "Rechercher"}
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-all active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              {tab === "taches" ? "Tâche" : tab === "projets" ? "Projet" : "Contact"}
            </button>
          </div>
        </div>

        {/* Global Search Bar */}
        {showSearch && (
          <GlobalSearch
            query={searchQuery}
            onQueryChange={setSearchQuery}
            inputRef={searchInputRef}
            onClose={() => { setShowSearch(false); setSearchQuery(""); }}
          />
        )}

        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setShowForm(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 pb-28 md:pb-6 flex flex-col">
        {tab === "taches"   && <TasksTab showForm={showForm} onCloseForm={() => setShowForm(false)} onConfirm={openConfirm} />}
        {tab === "projets"  && <ProjectsTab showForm={showForm} onCloseForm={() => setShowForm(false)} onConfirm={openConfirm} />}
        {tab === "contacts" && <ContactsTab showForm={showForm} onCloseForm={() => setShowForm(false)} onConfirm={openConfirm} />}
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={confirm.open} onOpenChange={closeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeConfirm}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirm.onConfirm(); closeConfirm(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   GLOBAL SEARCH
   ═════════════════════════════════════════════════════════════════════════════ */

function GlobalSearch({ query, onQueryChange, inputRef, onClose }: {
  query: string;
  onQueryChange: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const { data: tasks = [] } = useListTasks();
  const { data: projects = [] } = useListProjects();
  const { data: contacts = [] } = useListContacts();

  const results = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    const matchedTasks = tasks.filter((t: Task) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))).slice(0, 5);
    const matchedProjects = projects.filter((p: Project) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))).slice(0, 5);
    const matchedContacts = contacts.filter((c: Contact) => c.name.toLowerCase().includes(q) || (c.company && c.company.toLowerCase().includes(q)) || (c.email && c.email.toLowerCase().includes(q))).slice(0, 5);
    return { tasks: matchedTasks, projects: matchedProjects, contacts: matchedContacts };
  }, [query, tasks, projects, contacts]);

  const totalResults = results ? results.tasks.length + results.projects.length + results.contacts.length : 0;

  return (
    <div className="mb-4 animate-fade-in">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") onClose(); }}
          placeholder="Rechercher dans tâches, projets, contacts..."
          className="w-full bg-card border border-card-border rounded-xl pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button onClick={() => onQueryChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {results && query.trim() && (
        <div className="mt-2 bg-card border border-card-border rounded-xl shadow-lg overflow-hidden">
          {totalResults === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun résultat pour &quot;{query}&quot;</div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto py-1">
              {results.tasks.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tâches</div>
              )}
              {results.tasks.map((task: Task) => (
                <div key={`t-${task.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                  <CheckSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{task.title}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full shrink-0", priorityColor[task.priority])}>{priorityLabel[task.priority]}</span>
                </div>
              ))}
              {results.projects.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Projets</div>
              )}
              {results.projects.map((proj: Project) => (
                <div key={`p-${proj.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                  <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{proj.name}</span>
                </div>
              ))}
              {results.contacts.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Contacts</div>
              )}
              {results.contacts.map((contact: Contact) => (
                <div key={`c-${contact.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{contact.name}</span>
                  {contact.company && <span className="text-xs text-muted-foreground truncate">{contact.company}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   TASKS TAB
   ═════════════════════════════════════════════════════════════════════════════ */

function TasksTab({ showForm, onCloseForm, onConfirm }: { showForm: boolean; onCloseForm: () => void; onConfirm: (title: string, description: string, onConfirm: () => void) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: tasks = [], isLoading } = useListTasks();
  const { data: projects = [] } = useListProjects();
  const { getParam, setParam } = useQueryParams();

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [projectId, setProjectId] = useState<string>("");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<number | null>(null);

  // Filters state
  const [filters, setFilters] = useState({
    priority: getParam("priority") || "all",
    status: getParam("status") || "all",
    project: getParam("project") || "all",
    date: getParam("date") || "all",
  });

  // Update URL when filters change
  useEffect(() => {
    setParam("priority", filters.priority);
    setParam("status", filters.status);
    setParam("project", filters.project);
    setParam("date", filters.date);
  }, [filters]);

  const autoLinkTask = useAutoLinkTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Liaisons automatiques créées" });
        setCreatedTaskId(null);
      },
    },
  });

  const create = useCreateTask({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setTitle(""); setProjectId(""); setShowInlineCreate(false);
        const taskId = (data as { data?: { id?: number } })?.data?.id;
        if (taskId) setCreatedTaskId(taskId);
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((t: Task) => {
      if (filters.priority !== "all" && t.priority !== filters.priority) return false;
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (filters.project !== "all" && String(t.projectId) !== filters.project) return false;
      if (filters.date !== "all" && t.dueDate) {
        const due = new Date(t.dueDate);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (filters.date === "overdue" && diffDays >= 0) return false;
        if (filters.date === "today" && diffDays !== 0) return false;
        if (filters.date === "week" && (diffDays < 0 || diffDays > 7)) return false;
      }
      return true;
    });
  }, [tasks, filters]);

  const resetFilters = () => setFilters({ priority: "all", status: "all", project: "all", date: "all" });
  const hasFilters = filters.priority !== "all" || filters.status !== "all" || filters.project !== "all" || filters.date !== "all";

  return (
    <div className="flex-1 flex flex-col overflow-hidden space-y-3">
      {/* Sticky Filters Bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2 space-y-2 shrink-0">
        <div className="flex gap-2 items-center">
          <div className="flex gap-1.5 flex-1 overflow-x-auto pb-1 scrollbar-hide items-center">
            <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {/* Priority filter */}
            <select
              value={filters.priority}
              onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
              className="bg-secondary text-xs rounded-lg px-2 py-1.5 text-foreground outline-none border-none cursor-pointer shrink-0 transition-all duration-200 hover:bg-background"
            >
              <option value="all">Priorité</option>
              <option value="urgent">Urgent</option>
              <option value="high">Haut</option>
              <option value="medium">Moyen</option>
              <option value="low">Bas</option>
            </select>
            {/* Status filter */}
            <select
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="bg-secondary text-xs rounded-lg px-2 py-1.5 text-foreground outline-none border-none cursor-pointer shrink-0 transition-all duration-200 hover:bg-background"
            >
              <option value="all">Statut</option>
              <option value="todo">À faire</option>
              <option value="in_progress">En cours</option>
              <option value="done">Terminé</option>
              <option value="blocked">Bloqué</option>
            </select>
            {/* Project filter */}
            <select
              value={filters.project}
              onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}
              className="bg-secondary text-xs rounded-lg px-2 py-1.5 text-foreground outline-none border-none cursor-pointer shrink-0 transition-all duration-200 hover:bg-background"
            >
              <option value="all">Projet</option>
              {projects.map((p: Project) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
            {/* Date filter */}
            <select
              value={filters.date}
              onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
              className="bg-secondary text-xs rounded-lg px-2 py-1.5 text-foreground outline-none border-none cursor-pointer shrink-0 transition-all duration-200 hover:bg-background"
            >
              <option value="all">Date</option>
              <option value="overdue">En retard</option>
              <option value="today">Aujourd'hui</option>
              <option value="week">Cette semaine</option>
            </select>
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0"
              >
                Réinit.
              </button>
            )}
          </div>
          {/* Results count */}
          <span className="text-[10px] text-muted-foreground shrink-0">
            {filteredTasks.length} résultat{filteredTasks.length !== 1 ? "s" : ""}
          </span>
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
      </div>

      {/* Create form (full) */}
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
                create.mutate({ data: { title: title.trim(), priority: priority as TaskPriority, projectId: projectId ? Number(projectId) : null } });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Sans projet</option>
              {projects.map((p: Project) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5 flex-1">
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
          </div>
          <div className="flex gap-2">
            <button data-testid="button-cancel-task" onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]">
              Annuler
            </button>
            <button
              data-testid="button-save-task"
              disabled={!title.trim() || create.isPending}
              onClick={() => create.mutate({ data: { title: title.trim(), priority: priority as TaskPriority, projectId: projectId ? Number(projectId) : null } })}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              Créer
            </button>
          </div>
          {createdTaskId && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  autoLinkTask.mutate({ id: createdTaskId });
                  setCreatedTaskId(null);
                }}
                disabled={autoLinkTask.isPending}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-xs text-foreground hover:bg-secondary/80 transition-all"
              >
                <Link2 className="w-3.5 h-3.5" />
                {autoLinkTask.isPending ? "Liaison…" : "🔗 Lier automatiquement"}
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 shrink-0">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : view === "list" ? (
        <TaskListView
          tasks={filteredTasks}
          onUpdate={update}
          onDelete={del}
          onConfirm={onConfirm}
          projects={projects}
          onCreate={create}
          showInlineCreate={showInlineCreate}
          setShowInlineCreate={setShowInlineCreate}
        />
      ) : (
        <TaskKanbanView tasks={filteredTasks} onUpdate={update} onDelete={del} onConfirm={onConfirm} />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   INLINE CREATE TASK
   ═════════════════════════════════════════════════════════════════════════════ */

function InlineCreateTask({ onCreate, projects, onCancel }: {
  onCreate: ReturnType<typeof useCreateTask>;
  projects: Project[];
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [projectId, setProjectId] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate.mutate({
      data: {
        title: title.trim(),
        priority: priority as TaskPriority,
        projectId: projectId ? Number(projectId) : null,
      }
    });
  };

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-3 space-y-2 animate-slide-up shadow-sm hover-glow">
      <input
        autoFocus
        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
        placeholder="Nouvelle tâche..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && title.trim()) handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex items-center gap-2">
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="bg-input border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none"
        >
          <option value="">Projet</option>
          {projects.map(p => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {["low", "medium", "high", "urgent"].map(p => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={cn("w-6 h-6 rounded-full text-[9px] font-medium transition-colors flex items-center justify-center",
                priority === p ? priorityColor[p] : "bg-secondary text-muted-foreground"
              )}
              title={priorityLabel[p]}
            >
              {p.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || onCreate.isPending}
          className="ml-auto px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   TASK LIST VIEW
   ═════════════════════════════════════════════════════════════════════════════ */

function TaskListView({ tasks, onUpdate, onDelete, onConfirm, projects, onCreate, showInlineCreate, setShowInlineCreate }: {
  tasks: Task[];
  onUpdate: ReturnType<typeof useUpdateTask>;
  onDelete: ReturnType<typeof useDeleteTask>;
  onConfirm: (title: string, description: string, onConfirm: () => void) => void;
  projects: Project[];
  onCreate: ReturnType<typeof useCreateTask>;
  showInlineCreate: boolean;
  setShowInlineCreate: (v: boolean) => void;
}) {
  if (tasks.length === 0 && !showInlineCreate) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm space-y-3">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
          <CheckSquare className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <div className="text-center">
          <p>Aucune tâche pour le moment.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Créez votre première tâche avec le bouton ci-dessus.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 stagger">
      {/* Inline create button */}
      {!showInlineCreate && (
        <button
          onClick={() => setShowInlineCreate(true)}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all duration-300 text-sm hover:bg-secondary/50 animate-slide-up"
        >
          <Plus className="w-4 h-4" />
          Ajouter une tâche...
        </button>
      )}
      {showInlineCreate && (
        <InlineCreateTask onCreate={onCreate} projects={projects} onCancel={() => setShowInlineCreate(false)} />
      )}
      <PaginatedList items={tasks} initial={25} render={task => (
        <TaskCard
          key={task.id}
          task={task}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onConfirm={onConfirm}
        />
      )} />
    </div>
  );
}

/* ─── Task Card (modern) ───────────────────────────────────────────────────── */

function TaskCard({ task, onUpdate, onDelete, onConfirm }: {
  task: Task;
  onUpdate: ReturnType<typeof useUpdateTask>;
  onDelete: ReturnType<typeof useDeleteTask>;
  onConfirm: (title: string, description: string, onConfirm: () => void) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      data-testid={`task-item-${task.id}`}
      className={cn(
        "group bg-card border rounded-xl px-4 py-3 transition-all duration-300 hover:shadow-sm hover-lift",
        isHovered ? "border-border/80 shadow-sm" : "border-card-border"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        {/* Toggle status */}
        <button
          data-testid={`button-toggle-task-${task.id}`}
          onClick={() => onUpdate.mutate({ id: task.id, data: { status: task.status === "done" ? "todo" : "done" } })}
          className="shrink-0 mt-0.5 transition-colors min-h-[24px] min-w-[24px] flex items-center justify-center"
        >
          {task.status === "done"
            ? <Check className="w-4 h-4 text-emerald-400" />
            : <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground" />}
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title */}
          <div className={cn("text-sm font-medium leading-snug", statusColor[task.status])}>
            {task.title}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Priority badge */}
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", priorityColor[task.priority])}>
              <span className={cn("w-1 h-1 rounded-full", priorityDot[task.priority])} />
              {priorityLabel[task.priority]}
            </span>

            {/* Project tag */}
            {task.projectName && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                <FolderOpen className="w-2.5 h-2.5" />
                {task.projectName}
              </span>
            )}

            {/* Due date */}
            {task.dueDate && (
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full",
                new Date(task.dueDate) < new Date() ? "text-red-400 bg-red-500/10" : "text-muted-foreground bg-secondary"
              )}>
                <Calendar className="w-2.5 h-2.5" />
                {formatDueDate(task.dueDate)}
              </span>
            )}

            {/* Date relative */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatRelativeDate(task.createdAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onUpdate.mutate({ id: task.id, data: { status: (STATUS_CYCLE[task.status] ?? "todo") as TaskUpdateStatus } })}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Avancer le statut"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            data-testid={`button-delete-task-${task.id}`}
            onClick={() => {
              onConfirm(
                "Supprimer la tâche",
                "Cette action est irréversible. Voulez-vous continuer ?",
                () => onDelete.mutate({ id: task.id })
              );
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Supprimer la tâche"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   KANBAN VIEW (HTML5 Drag & Drop)
   ═════════════════════════════════════════════════════════════════════════════ */

function TaskKanbanView({ tasks, onUpdate, onDelete, onConfirm }: {
  tasks: Task[];
  onUpdate: ReturnType<typeof useUpdateTask>;
  onDelete: ReturnType<typeof useDeleteTask>;
  onConfirm: (title: string, description: string, onConfirm: () => void) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const activeTasks = tasks.filter(t => t.status !== "cancelled");

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(taskId));
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData("text/plain"));
    const task = activeTasks.find(t => t.id === taskId);
    if (task && task.status !== status) {
      onUpdate.mutate({ id: taskId, data: { status: status as TaskUpdateStatus } });
    }
    setDraggingId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex-1 overflow-x-auto min-h-0 overscroll-x-contain" style={{ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}>
      <div className="flex gap-3 h-full min-w-max pb-2">
        {KANBAN_COLUMNS.map(col => {
          const colTasks = activeTasks.filter(t => t.status === col.status);
          const isDragOver = dragOverColumn === col.status;
          return (
            <div key={col.status} className="flex flex-col w-[260px] md:w-[280px] shrink-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", col.dotColor)} />
                <span className="text-xs font-semibold text-foreground">{col.label}</span>
                <span className={cn("ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full", col.bgColor, col.borderColor.replace("border-", "text-").replace("/20", ""))}>
                  {colTasks.length}
                </span>
              </div>
              {/* Drop zone */}
              <div
                className={cn(
                  "flex-1 overflow-y-auto space-y-2 min-h-0 pr-0.5 rounded-xl border-2 border-dashed p-2 transition-all duration-300",
                  isDragOver
                    ? cn("border-opacity-100 scale-[1.01] shadow-md", col.borderColor, col.bgColor)
                    : "border-transparent bg-secondary/30"
                )}
                onDragOver={e => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.status)}
              >
                {colTasks.length === 0 && !isDragOver ? (
                  <div className="h-20 border-2 border-dashed border-border/30 rounded-xl flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground/40">Glisser ici</span>
                  </div>
                ) : (
                  colTasks.map(task => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      isDragging={draggingId === task.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onMove={status => onUpdate.mutate({ id: task.id, data: { status: status as TaskUpdateStatus } })}
                      onDelete={() => onDelete.mutate({ id: task.id })}
                      onConfirm={onConfirm}
                    />
                  ))
                )}
                {isDragOver && colTasks.length === 0 && (
                  <div className="h-20 border-2 border-dashed rounded-xl flex items-center justify-center animate-pulse"
                    style={{ borderColor: "inherit" }}
                  >
                    <span className="text-[10px] font-medium">Déposer ici</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Kanban Card ──────────────────────────────────────────────────────────── */

function KanbanCard({ task, isDragging, onDragStart, onDragEnd, onMove, onDelete, onConfirm }: {
  task: Task;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, taskId: number) => void;
  onDragEnd: () => void;
  onMove: (status: string) => void;
  onDelete: () => void;
  onConfirm: (title: string, description: string, onConfirm: () => void) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const qc = useQueryClient();
  const { data: suggestions } = useGetTaskSuggestions(task.id, { query: { enabled: showActions, queryKey: getGetTaskSuggestionsQueryKey(task.id) } });
  const autoLink = useAutoLinkTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
      },
    },
  });

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-card border rounded-xl p-3 space-y-2 cursor-grab active:cursor-grabbing transition-all duration-200 group relative hover:shadow-sm",
        isDragging ? "opacity-40 border-dashed border-primary rotate-1 scale-[0.98]" : "border-card-border hover:border-border/80"
      )}
      onClick={() => setShowActions(s => !s)}
    >
      {/* Drag handle */}
      <div className="flex items-start gap-2">
        <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground leading-snug">{task.title}</div>
          {task.projectName && (
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <FolderOpen className="w-2.5 h-2.5" />
              {task.projectName}
            </div>
          )}
        </div>
        <button
          onClick={e => {
            e.stopPropagation();
            onConfirm(
              "Supprimer la tâche",
              "Cette action est irréversible. Voulez-vous continuer ?",
              () => onDelete()
            );
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
          aria-label="Supprimer la tâche"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border", priorityColor[task.priority])}>
          <span className={cn("w-1 h-1 rounded-full", priorityDot[task.priority])} />
          {priorityLabel[task.priority]}
        </span>
        {task.dueDate && (
          <span className={cn(
            "text-[9px] px-1.5 py-0.5 rounded-full",
            new Date(task.dueDate) < new Date() ? "text-red-400 bg-red-500/10" : "text-muted-foreground bg-secondary"
          )}>
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>

      {/* Suggested links badges */}
      {showActions && suggestions && suggestions.data && suggestions.data.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {suggestions.data.slice(0, 3).map((s: { entityType: string; entityId: number; entityName: string; score: number; reason?: string }) => (
            <button
              key={`${s.entityType}-${s.entityId}`}
              onClick={(e) => {
                e.stopPropagation();
                autoLink.mutate({ id: task.id });
                setShowActions(false);
              }}
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              title={s.reason}
            >
              + {s.entityName} ({Math.round(s.score * 100)}%)
            </button>
          ))}
        </div>
      )}

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

/* ═════════════════════════════════════════════════════════════════════════════
   PROJECTS TAB
   ═════════════════════════════════════════════════════════════════════════════ */

function ProjectsTab({ showForm, onCloseForm, onConfirm }: { showForm: boolean; onCloseForm: () => void; onConfirm: (title: string, description: string, onConfirm: () => void) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: projects = [], isLoading } = useListProjects();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);

  const autoLinkProject = useAutoLinkProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Liaisons automatiques créées" });
        setCreatedProjectId(null);
      },
    },
  });

  const create = useCreateProject({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setName(""); setDescription(""); onCloseForm();
        const projId = (data as { data?: { id?: number } })?.data?.id;
        if (projId) setCreatedProjectId(projId);
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
  const projectStatusDot: Record<string, string> = {
    active: "bg-emerald-500", paused: "bg-amber-500", completed: "bg-blue-500", archived: "bg-muted-foreground",
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in shrink-0 space-y-3">
          <input
            data-testid="input-project-name"
            autoFocus
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Nom du projet..."
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Description (optionnel)..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]">
              Annuler
            </button>
            <button
              data-testid="button-save-project"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ data: { name: name.trim(), description: description || undefined } })}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              Créer
            </button>
          </div>
          {createdProjectId && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  autoLinkProject.mutate({ id: createdProjectId });
                  setCreatedProjectId(null);
                }}
                disabled={autoLinkProject.isPending}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-xs text-foreground hover:bg-secondary/80 transition-all"
              >
                <Link2 className="w-3.5 h-3.5" />
                {autoLinkProject.isPending ? "Liaison…" : "🔗 Lier automatiquement"}
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
            <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
          </div>
          Aucun projet pour le moment.<br/><span className="text-xs text-muted-foreground/60">Créez votre premier projet avec le bouton ci-dessus.</span>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          <PaginatedList items={projects} initial={20} render={proj => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onUpdate={update}
              onDelete={del}
              onConfirm={onConfirm}
              projectStatusLabel={projectStatusLabel}
              projectStatusColor={projectStatusColor}
              projectStatusDot={projectStatusDot}
            />
          )} />
        </div>
      )}
    </div>
  );
}

/* ─── Project Card ─────────────────────────────────────────────────────────── */

function ProjectCard({ project, onUpdate, onDelete, onConfirm, projectStatusLabel, projectStatusColor, projectStatusDot }: {
  project: Project;
  onUpdate: ReturnType<typeof useUpdateProject>;
  onDelete: ReturnType<typeof useDeleteProject>;
  onConfirm: (title: string, description: string, onConfirm: () => void) => void;
  projectStatusLabel: Record<string, string>;
  projectStatusColor: Record<string, string>;
  projectStatusDot: Record<string, string>;
}) {
  const total = project.taskCount ?? 0;
  const completed = project.completedTaskCount ?? 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const [showRelated, setShowRelated] = useState(false);
  const qc = useQueryClient();
  const { data: related } = useGetProjectRelated(project.id, { query: { enabled: showRelated, queryKey: getGetProjectRelatedQueryKey(project.id) } });
  const { data: suggestions } = useGetProjectSuggestions(project.id, { query: { enabled: showRelated, queryKey: getGetProjectSuggestionsQueryKey(project.id) } });
  const autoLink = useAutoLinkProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      },
    },
  });

  return (
    <div
      data-testid={`project-item-${project.id}`}
      className="bg-card border border-card-border rounded-xl p-4 group hover:border-border/80 hover:shadow-sm transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{project.name}</div>
          {project.description && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{project.description}</div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => {
              const cycle: Record<string, string> = { active: "paused", paused: "completed", completed: "archived", archived: "active" };
              onUpdate.mutate({
                id: project.id,
                data: { status: (cycle[project.status] ?? "active") as Project["status"] },
              });
            }}
            className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors cursor-pointer inline-flex items-center gap-1", projectStatusColor[project.status])}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", projectStatusDot[project.status])} />
            {projectStatusLabel[project.status] ?? project.status}
          </button>
          <button
            data-testid={`button-delete-project-${project.id}`}
            onClick={() => {
              onConfirm(
                "Supprimer le projet",
                "Cette action est irréversible. Voulez-vous continuer ?",
                () => onDelete.mutate({ id: project.id })
              );
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label="Supprimer le projet"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">{completed}/{total} tâches</span>
            <span className={cn("font-medium", progress === 100 ? "text-emerald-400" : "text-foreground")}>{progress}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress === 100 ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Task status breakdown */}
          <div className="flex gap-2 pt-1">
            <span className="text-[9px] text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground mr-0.5" />
              {(project.taskCount ?? 0) - (project.completedTaskCount ?? 0)} restante{((project.taskCount ?? 0) - (project.completedTaskCount ?? 0)) !== 1 ? "s" : ""}
            </span>
            <span className="text-[9px] text-emerald-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5" />
              {project.completedTaskCount} terminée{project.completedTaskCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="text-[10px] text-muted-foreground/50 mt-1">Aucune tâche associée</div>
      )}

      {/* Related entities toggle */}
      <div className="mt-2 pt-2 border-t border-border/30">
        <button
          onClick={() => setShowRelated(s => !s)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link2 className="w-3 h-3" />
          {showRelated ? "Masquer les liens" : "Voir les liens"}
        </button>

        {showRelated && related && related.data && (
          <div className="mt-2 space-y-1.5 animate-fade-in">
            <div className="flex flex-wrap gap-2">
              {related.data.contacts && related.data.contacts.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  <Users className="w-2.5 h-2.5" />
                  {related.data.contacts.length} contact{related.data.contacts.length !== 1 ? "s" : ""}
                </span>
              )}
              {related.data.assets && related.data.assets.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  <Paperclip className="w-2.5 h-2.5" />
                  {related.data.assets.length} asset{related.data.assets.length !== 1 ? "s" : ""}
                </span>
              )}
              {related.data.memories && related.data.memories.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  <Clock className="w-2.5 h-2.5" />
                  {related.data.memories.length} mémoire{related.data.memories.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Suggestions */}
            {suggestions && suggestions.data && suggestions.data.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {suggestions.data.slice(0, 3).map((s: { entityType: string; entityId: number; entityName: string; score: number; reason?: string }) => (
                  <button
                    key={`${s.entityType}-${s.entityId}`}
                    onClick={() => autoLink.mutate({ id: project.id })}
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                    title={s.reason}
                  >
                    + {s.entityName} ({Math.round(s.score * 100)}%)
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   CONTACTS TAB
   ═════════════════════════════════════════════════════════════════════════════ */

function ContactsTab({ showForm, onCloseForm, onConfirm }: { showForm: boolean; onCloseForm: () => void; onConfirm: (title: string, description: string, onConfirm: () => void) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: contacts = [], isLoading } = useListContacts();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("prospect");
  const [createdContactId, setCreatedContactId] = useState<number | null>(null);

  const autoLinkContact = useAutoLinkContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        toast({ title: "Liaisons automatiques créées" });
        setCreatedContactId(null);
      },
    },
  });

  const create = useCreateContact({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        setName(""); setCompany(""); setEmail(""); setPhone(""); onCloseForm();
        const contactId = (data as { data?: { id?: number } })?.data?.id;
        if (contactId) setCreatedContactId(contactId);
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
          <input
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Téléphone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
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
            <button onClick={onCloseForm} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]">
              Annuler
            </button>
            <button
              data-testid="button-save-contact"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ data: { name: name.trim(), company: company || undefined, email: email || undefined, phone: phone || undefined, status: status as ContactStatus } })}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              Créer
            </button>
          </div>
          {createdContactId && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  autoLinkContact.mutate({ id: createdContactId });
                  setCreatedContactId(null);
                }}
                disabled={autoLinkContact.isPending}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-xs text-foreground hover:bg-secondary/80 transition-all"
              >
                <Link2 className="w-3.5 h-3.5" />
                {autoLinkContact.isPending ? "Liaison…" : "🔗 Lier automatiquement"}
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />)}</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
            <Users className="w-8 h-8 text-muted-foreground/50" />
          </div>
          Aucun contact pour le moment.<br/><span className="text-xs text-muted-foreground/60">Ajoutez votre premier contact avec le bouton ci-dessus.</span>
        </div>
      ) : (
        <div className="space-y-2 stagger">
          <PaginatedList items={contacts} initial={20} render={contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onUpdate={update}
              onDelete={del}
              onConfirm={onConfirm}
            />
          )} />
        </div>
      )}
    </div>
  );
}

/* ─── Contact Card ─────────────────────────────────────────────────────────── */

function ContactCard({ contact, onUpdate, onDelete, onConfirm }: {
  contact: Contact;
  onUpdate: ReturnType<typeof useUpdateContact>;
  onDelete: ReturnType<typeof useDeleteContact>;
  onConfirm: (title: string, description: string, onConfirm: () => void) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const qc = useQueryClient();
  const { data: related } = useGetContactRelated(contact.id, { query: { enabled: showRelated, queryKey: getGetContactRelatedQueryKey(contact.id) } });
  const { data: suggestions } = useGetContactSuggestions(contact.id, { query: { enabled: showRelated, queryKey: getGetContactSuggestionsQueryKey(contact.id) } });
  const autoLink = useAutoLinkContact({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      },
    },
  });

  const cycleStatus = () => {
    const cycle: Record<string, string> = { prospect: "active", active: "client", client: "inactive", inactive: "prospect" };
    onUpdate.mutate({ id: contact.id, data: { status: (cycle[contact.status] ?? "prospect") as ContactStatus } });
  };

  return (
    <div
      data-testid={`contact-item-${contact.id}`}
      className="bg-card border border-card-border rounded-xl px-4 py-3 hover:border-border/80 hover:shadow-sm transition-all duration-200 group"
    >
      <div className="flex items-center gap-3">
        {/* Avatar with color */}
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0", getAvatarColor(contact.name))}>
          {getInitials(contact.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-foreground truncate">{contact.name}</div>
            <button
              onClick={cycleStatus}
              className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 transition-colors cursor-pointer inline-flex items-center gap-1", contactStatusColor[contact.status])}
            >
              {contactStatusLabel[contact.status] ?? contact.status}
            </button>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {[contact.company, contact.email].filter(Boolean).join(" · ")}
          </div>
          {contact.lastContactedAt && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-0.5">
              <Clock className="w-2.5 h-2.5" />
              Dernière interaction : {formatRelativeDate(contact.lastContactedAt)}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              title="Envoyer un email"
            >
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              title="Appeler"
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={() => setShowActions(!showActions)}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid={`button-delete-contact-${contact.id}`}
            onClick={() => {
              onConfirm(
                "Supprimer le contact",
                "Cette action est irréversible. Voulez-vous continuer ?",
                () => onDelete.mutate({ id: contact.id })
              );
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            aria-label="Supprimer le contact"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Related entities toggle */}
      <div className="mt-2">
        <button
          onClick={() => setShowRelated(s => !s)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link2 className="w-3 h-3" />
          {showRelated ? "Masquer les liens" : "Voir les liens"}
        </button>

        {showRelated && related && related.data && (
          <div className="mt-2 space-y-1.5 animate-fade-in">
            {/* Linked projects */}
            {related.data.projects && related.data.projects.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {related.data.projects.map((p: Project) => (
                  <span key={p.id} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    <FolderOpen className="w-2.5 h-2.5" />
                    {p.name}
                  </span>
                ))}
              </div>
            )}
            {/* Tasks mentioning this contact */}
            {related.data.tasks && related.data.tasks.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                <CheckSquare className="w-2.5 h-2.5" />
                {related.data.tasks.length} tâche{related.data.tasks.length !== 1 ? "s" : ""} mentionnant ce contact
              </span>
            )}
            {/* Memories mentioning this contact */}
            {related.data.memories && related.data.memories.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                <Clock className="w-2.5 h-2.5" />
                {related.data.memories.length} mémoire{related.data.memories.length !== 1 ? "s" : ""}
              </span>
            )}

            {/* Suggestions */}
            {suggestions && suggestions.data && suggestions.data.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {suggestions.data.slice(0, 3).map((s: { entityType: string; entityId: number; entityName: string; score: number; reason?: string }) => (
                  <button
                    key={`${s.entityType}-${s.entityId}`}
                    onClick={() => autoLink.mutate({ id: contact.id })}
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                    title={s.reason}
                  >
                    + {s.entityName} ({Math.round(s.score * 100)}%)
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded actions */}
      {showActions && (
        <div className="mt-2 pt-2 border-t border-border/50 flex gap-2 animate-fade-in">
          <button
            onClick={() => {
              const cycle: Record<string, string> = { prospect: "active", active: "client", client: "inactive", inactive: "prospect" };
              onUpdate.mutate({ id: contact.id, data: { status: (cycle[contact.status] ?? "prospect") as ContactStatus, lastContactedAt: new Date().toISOString() } });
              setShowActions(false);
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check className="w-3 h-3" />
            Marquer comme contacté
          </button>
        </div>
      )}
    </div>
  );
}
