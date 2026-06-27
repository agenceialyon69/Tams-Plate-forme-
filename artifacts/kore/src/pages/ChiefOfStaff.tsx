import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProjects, createProject, updateProject,
  listTasks, createTask, updateTask,
  listDecisions, createDecision, updateDecision,
  listRisks, createRisk, updateRisk,
  listObjectives, createObjective,
  type Project, type CosTask, type Decision, type Risk, type Objective,
} from "@/lib/cos";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  Brain, Plus, CheckSquare, AlertTriangle, Target, ChevronDown,
  Layers, X, Check, RotateCcw,
} from "lucide-react";

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10",
  high:     "text-orange-400 bg-orange-500/10",
  medium:   "text-yellow-400 bg-yellow-500/10",
  low:      "text-muted-foreground bg-muted/40",
};

const STATUS_DOT: Record<string, string> = {
  active:   "bg-emerald-500",
  paused:   "bg-yellow-500",
  done:     "bg-muted-foreground",
  archived: "bg-muted-foreground/40",
  todo:     "bg-muted-foreground/40",
  doing:    "bg-blue-400",
  blocked:  "bg-red-400",
  open:     "bg-yellow-400",
  decided:  "bg-emerald-500",
  reversed: "bg-muted-foreground",
  on_track: "bg-emerald-500",
  at_risk:  "bg-yellow-400",
  behind:   "bg-red-400",
};

function PBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${PRIORITY_COLOR[priority] ?? "text-muted-foreground"}`}>
      {priority}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-muted"}`} />;
}

function SectionHeader({
  icon, title, count, onAdd, adding, setAdding,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onAdd?: () => void;
  adding?: boolean;
  setAdding?: (v: boolean) => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="rounded-full bg-muted/60 px-1.5 text-[11px] text-muted-foreground">{count}</span>
      </div>
      {setAdding && (
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Ajouter
        </button>
      )}
    </div>
  );
}

function AddForm({ fields, onSubmit, onCancel, busy }: {
  fields: { key: string; placeholder: string; type?: string }[];
  onSubmit: (vals: Record<string, string>) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(vals); }}
      className="mb-4 rounded-xl border border-border/60 bg-card/30 p-4 space-y-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <input
            key={f.key}
            type={f.type ?? "text"}
            placeholder={f.placeholder}
            value={vals[f.key] ?? ""}
            onChange={(e) => setVals(v => ({ ...v, [f.key]: e.target.value }))}
            className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Annuler</button>
        <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

export default function ChiefOfStaff() {
  const qc = useQueryClient();
  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const [addingProject, setAddingProject] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [addingRisk, setAddingRisk] = useState(false);
  const [addingObj, setAddingObj] = useState(false);
  const [tab, setTab] = useState<"today" | "projects" | "decisions" | "risks" | "objectives">("today");

  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const tasks = useQuery({ queryKey: ["cos_tasks"], queryFn: () => listTasks() });
  const decisions = useQuery({ queryKey: ["decisions"], queryFn: listDecisions });
  const risks = useQuery({ queryKey: ["risks"], queryFn: listRisks });
  const objectives = useQuery({ queryKey: ["objectives"], queryFn: listObjectives });

  const createProjMut = useMutation({
    mutationFn: createProject,
    onSuccess: () => { toast.success("Projet créé"); inv(["projects"]); setAddingProject(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const createTaskMut = useMutation({
    mutationFn: createTask,
    onSuccess: () => { toast.success("Tâche créée"); inv(["cos_tasks"]); setAddingTask(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateTaskMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CosTask> }) => updateTask(id, patch),
    onSuccess: () => { inv(["cos_tasks"]); },
  });
  const createDecMut = useMutation({
    mutationFn: createDecision,
    onSuccess: () => { toast.success("Décision enregistrée"); inv(["decisions"]); setAddingDecision(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateDecMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Decision> }) => updateDecision(id, patch),
    onSuccess: () => { inv(["decisions"]); toast.success("Mis à jour"); },
  });
  const createRiskMut = useMutation({
    mutationFn: createRisk,
    onSuccess: () => { toast.success("Risque créé"); inv(["risks"]); setAddingRisk(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateRiskMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Risk> }) => updateRisk(id, patch),
    onSuccess: () => { inv(["risks"]); toast.success("Mis à jour"); },
  });
  const createObjMut = useMutation({
    mutationFn: createObjective,
    onSuccess: () => { toast.success("Objectif créé"); inv(["objectives"]); setAddingObj(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateProjMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Project> }) => updateProject(id, patch),
    onSuccess: () => { inv(["projects"]); toast.success("Mis à jour"); },
  });

  const todayTasks = (tasks.data ?? []).filter(t => t.status !== "done");
  const openRisks = (risks.data ?? []).filter(r => r.status === "open" && r.severity === "critical");
  const openDecisions = (decisions.data ?? []).filter(d => d.status === "open");

  const tabs = [
    { id: "today", label: "Aujourd'hui" },
    { id: "projects", label: "Projets" },
    { id: "decisions", label: "Décisions" },
    { id: "risks", label: "Risques" },
    { id: "objectives", label: "OKR" },
  ] as const;

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Chief of Staff</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Priorités, décisions, risques. Clarté opérationnelle.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <MiniStat label="Tâches" value={todayTasks.length} />
            <MiniStat label="Risques" value={openRisks.length} warning={openRisks.length > 0} />
            <MiniStat label="Décisions" value={openDecisions.length} />
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Today */}
        {tab === "today" && (
          <div className="space-y-6">
            {openRisks.length > 0 && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">{openRisks.length} risque(s) critique(s)</span>
                </div>
                <ul className="space-y-1">
                  {openRisks.map(r => (
                    <li key={r.id} className="text-xs text-muted-foreground">→ {r.title}</li>
                  ))}
                </ul>
              </div>
            )}

            <section>
              <SectionHeader
                icon={<CheckSquare className="h-4 w-4" />}
                title="Tâches actives"
                count={todayTasks.length}
                adding={addingTask}
                setAdding={setAddingTask}
              />
              {addingTask && (
                <AddForm
                  fields={[
                    { key: "title", placeholder: "Titre de la tâche *" },
                    { key: "priority", placeholder: "Priorité (critical/high/medium/low)" },
                  ]}
                  onSubmit={(v) => createTaskMut.mutate({
                    title: v.title || "Tâche",
                    description: null,
                    priority: (v.priority as CosTask["priority"]) || "medium",
                    status: "todo",
                    due_date: null,
                    project_id: null,
                  })}
                  onCancel={() => setAddingTask(false)}
                  busy={createTaskMut.isPending}
                />
              )}
              <TaskList
                tasks={todayTasks}
                onToggle={(t) => updateTaskMut.mutate({ id: t.id, patch: { status: t.status === "done" ? "todo" : "done" } })}
                onDoing={(t) => updateTaskMut.mutate({ id: t.id, patch: { status: "doing" } })}
              />
            </section>

            <section>
              <SectionHeader icon={<ChevronDown className="h-4 w-4" />} title="Décisions ouvertes" count={openDecisions.length} />
              <DecisionList decisions={openDecisions} onDecide={(d, chosen) => updateDecMut.mutate({ id: d.id, patch: { status: "decided", chosen, decided_at: new Date().toISOString() } })} />
            </section>
          </div>
        )}

        {/* Projects */}
        {tab === "projects" && (
          <section>
            <SectionHeader icon={<Layers className="h-4 w-4" />} title="Projets" count={(projects.data ?? []).length} adding={addingProject} setAdding={setAddingProject} />
            {addingProject && (
              <AddForm
                fields={[
                  { key: "name", placeholder: "Nom du projet *" },
                  { key: "priority", placeholder: "Priorité (critical/high/medium/low)" },
                  { key: "description", placeholder: "Description" },
                ]}
                onSubmit={(v) => createProjMut.mutate({
                  name: v.name || "Projet",
                  description: v.description || null,
                  status: "active",
                  priority: (v.priority as Project["priority"]) || "medium",
                  due_date: null,
                })}
                onCancel={() => setAddingProject(false)}
                busy={createProjMut.isPending}
              />
            )}
            <div className="space-y-2">
              {(projects.data ?? []).length === 0 && !addingProject && <Empty text="Aucun projet. Commencez par en créer un." />}
              {(projects.data ?? []).map((p: Project) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/20 p-4">
                  <StatusDot status={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      <PBadge priority={p.priority} />
                    </div>
                    {p.description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{p.description}</p>}
                  </div>
                  <select
                    value={p.status}
                    onChange={(e) => updateProjMut.mutate({ id: p.id, patch: { status: e.target.value as Project["status"] } })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
                  >
                    <option value="active">actif</option>
                    <option value="paused">pause</option>
                    <option value="done">terminé</option>
                    <option value="archived">archivé</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Decisions */}
        {tab === "decisions" && (
          <section>
            <SectionHeader icon={<ChevronDown className="h-4 w-4" />} title="Décisions" count={(decisions.data ?? []).length} adding={addingDecision} setAdding={setAddingDecision} />
            {addingDecision && (
              <AddForm
                fields={[
                  { key: "title", placeholder: "Décision à prendre *" },
                  { key: "context", placeholder: "Contexte" },
                ]}
                onSubmit={(v) => createDecMut.mutate({ title: v.title || "Décision", context: v.context || null, project_id: null })}
                onCancel={() => setAddingDecision(false)}
                busy={createDecMut.isPending}
              />
            )}
            <div className="space-y-2">
              {(decisions.data ?? []).length === 0 && !addingDecision && <Empty text="Aucune décision en cours." />}
              {(decisions.data ?? []).map((d: Decision) => (
                <div key={d.id} className="rounded-xl border border-border/50 bg-card/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusDot status={d.status} />
                        <span className="text-sm font-medium">{d.title}</span>
                      </div>
                      {d.context && <p className="mt-1 text-xs text-muted-foreground">{d.context}</p>}
                      {d.chosen && (
                        <p className="mt-1 text-xs">
                          <span className="text-muted-foreground">Choix : </span>
                          <span className="font-medium text-emerald-400">{d.chosen}</span>
                        </p>
                      )}
                    </div>
                    {d.status === "open" && (
                      <div className="flex shrink-0 gap-1.5">
                        <RedTeamButton decision={d} onDecide={(chosen) => updateDecMut.mutate({ id: d.id, patch: { status: "decided", chosen, decided_at: new Date().toISOString() } })} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Risks */}
        {tab === "risks" && (
          <section>
            <SectionHeader icon={<AlertTriangle className="h-4 w-4" />} title="Risques ouverts" count={(risks.data ?? []).length} adding={addingRisk} setAdding={setAddingRisk} />
            {addingRisk && (
              <AddForm
                fields={[
                  { key: "title", placeholder: "Risque identifié *" },
                  { key: "severity", placeholder: "Sévérité (critical/high/medium/low)" },
                  { key: "probability", placeholder: "Probabilité (high/medium/low)" },
                ]}
                onSubmit={(v) => createRiskMut.mutate({
                  title: v.title || "Risque",
                  description: null,
                  severity: (v.severity as Risk["severity"]) || "medium",
                  probability: (v.probability as Risk["probability"]) || "medium",
                  project_id: null,
                })}
                onCancel={() => setAddingRisk(false)}
                busy={createRiskMut.isPending}
              />
            )}
            <div className="space-y-2">
              {(risks.data ?? []).length === 0 && !addingRisk && <Empty text="Aucun risque ouvert." />}
              {(risks.data ?? []).map((r: Risk) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/20 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <PBadge priority={r.severity} />
                      <span className="text-sm font-medium">{r.title}</span>
                    </div>
                    {r.description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{r.description}</p>}
                  </div>
                  <select
                    value={r.status}
                    onChange={(e) => updateRiskMut.mutate({ id: r.id, patch: { status: e.target.value as Risk["status"] } })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
                  >
                    <option value="open">ouvert</option>
                    <option value="mitigated">mitigé</option>
                    <option value="accepted">accepté</option>
                    <option value="closed">fermé</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Objectives */}
        {tab === "objectives" && (
          <section>
            <SectionHeader icon={<Target className="h-4 w-4" />} title="Objectifs (OKR)" count={(objectives.data ?? []).length} adding={addingObj} setAdding={setAddingObj} />
            {addingObj && (
              <AddForm
                fields={[
                  { key: "title", placeholder: "Objectif *" },
                  { key: "quarter", placeholder: "Trimestre (ex: Q3 2026)" },
                  { key: "description", placeholder: "Description" },
                ]}
                onSubmit={(v) => createObjMut.mutate({ title: v.title || "Objectif", description: v.description || null, quarter: v.quarter || null })}
                onCancel={() => setAddingObj(false)}
                busy={createObjMut.isPending}
              />
            )}
            <div className="space-y-2">
              {(objectives.data ?? []).length === 0 && !addingObj && <Empty text="Aucun objectif défini." />}
              {(objectives.data ?? []).map((o: Objective) => (
                <div key={o.id} className="rounded-xl border border-border/50 bg-card/20 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={o.status} />
                      <span className="text-sm font-medium">{o.title}</span>
                      {o.quarter && <span className="font-mono text-[10px] text-muted-foreground">{o.quarter}</span>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{Number(o.progress).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Number(o.progress))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AuthedLayout>
  );
}

function TaskList({
  tasks, onToggle, onDoing,
}: {
  tasks: CosTask[];
  onToggle: (t: CosTask) => void;
  onDoing: (t: CosTask) => void;
}) {
  if (tasks.length === 0) return <Empty text="Aucune tâche active." />;
  return (
    <ul className="space-y-1.5">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/20 px-3 py-2.5">
          <button
            onClick={() => onToggle(t)}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              t.status === "done"
                ? "border-emerald-500 bg-emerald-500"
                : "border-border hover:border-primary"
            }`}
          >
            {t.status === "done" && <Check className="h-3 w-3 text-white" />}
          </button>
          <span className={`flex-1 text-sm ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>
            {t.title}
          </span>
          <PBadge priority={t.priority} />
          {t.status !== "doing" && t.status !== "done" && (
            <button onClick={() => onDoing(t)} className="text-[10px] text-muted-foreground hover:text-blue-400">
              → En cours
            </button>
          )}
          {t.status === "doing" && (
            <span className="text-[10px] font-medium text-blue-400">en cours</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DecisionList({
  decisions, onDecide,
}: {
  decisions: Decision[];
  onDecide: (d: Decision, chosen: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [val, setVal] = useState("");
  if (decisions.length === 0) return <Empty text="Aucune décision ouverte." />;
  return (
    <ul className="space-y-1.5">
      {decisions.map((d) => (
        <li key={d.id} className="rounded-lg border border-border/40 bg-card/20 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{d.title}</span>
            {editing !== d.id ? (
              <button onClick={() => { setEditing(d.id); setVal(""); }} className="text-[10px] text-primary hover:underline">
                Décider
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder="Votre choix"
                  className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button onClick={() => { if (val.trim()) { onDecide(d, val.trim()); setEditing(null); } }} className="text-emerald-400 hover:text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {d.context && <p className="mt-0.5 text-[11px] text-muted-foreground">{d.context}</p>}
        </li>
      ))}
    </ul>
  );
}

function RedTeamButton({
  decision, onDecide,
}: {
  decision: Decision;
  onDecide: (chosen: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10"
      >
        <RotateCcw className="h-3 w-3" />
        Red team
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 p-1.5">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Argument contraire"
        className="w-36 rounded bg-background px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MiniStat({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-center">
      <div className={`text-lg font-semibold tabular-nums ${warning && value > 0 ? "text-red-400" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground/60">{text}</div>;
}
