import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  listPrompts, createPrompt, updatePrompt, deletePrompt,
  listTemplates, createTemplate,
  listTools, createTool, updateTool,
  type Prompt, type PromptTemplate, type ToolDefinition,
  type PromptCategory, type PromptStatus,
} from "@/lib/studio";
import {
  Wand2, Plus, Search, Trash2, Copy, Tag, Zap,
  BookTemplate, Wrench, Save, RotateCcw, Check, X,
} from "lucide-react";

const CATEGORY_LABEL: Record<PromptCategory, string> = {
  system:     "Système",
  user:       "Utilisateur",
  assistant:  "Assistant",
  chain:      "Chaîne",
  red_team:   "Red Team",
  evaluation: "Évaluation",
  other:      "Autre",
};

const CATEGORY_COLOR: Record<PromptCategory, string> = {
  system:     "text-indigo-400 bg-indigo-500/10",
  user:       "text-blue-400 bg-blue-500/10",
  assistant:  "text-emerald-400 bg-emerald-500/10",
  chain:      "text-violet-400 bg-violet-500/10",
  red_team:   "text-red-400 bg-red-500/10",
  evaluation: "text-yellow-400 bg-yellow-500/10",
  other:      "text-muted-foreground bg-muted/30",
};

const CATEGORIES: PromptCategory[] = [
  "system","user","assistant","chain","red_team","evaluation","other",
];

function CatBadge({ cat }: { cat: PromptCategory }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLOR[cat]}`}>
      {CATEGORY_LABEL[cat]}
    </span>
  );
}

function CharCount({ text, max = 8192 }: { text: string; max?: number }) {
  const pct = Math.min(100, (text.length / max) * 100);
  const color = pct > 90 ? "text-red-400" : pct > 70 ? "text-yellow-400" : "text-muted-foreground";
  return (
    <span className={`font-mono text-[10px] ${color}`}>
      {text.length.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}

function RedTeamPanel({ content, onUse }: { content: string; onUse: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");

  function generate() {
    const critiques = [
      `Ce prompt assume trop. Reformule en demandant d'abord les contraintes réelles.`,
      `Angle opposé : et si l'objectif était de minimiser l'impact plutôt que de l'optimiser ?`,
      `Hypothèse cachée : "${content.slice(0, 40)}…" — que se passe-t-il si le contexte est exactement l'inverse ?`,
      `Red flag détecté : ce prompt pousse vers une réponse unique. Ajoute "donne 3 alternatives contradictoires."`,
      `Devil's advocate : Si ce prompt était mal utilisé, comment ? Intègre une garde-fou explicite.`,
    ];
    setResult(critiques[Math.floor(Math.random() * critiques.length)]);
  }

  if (!open) return (
    <button onClick={() => { setOpen(true); generate(); }}
      className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10"
    >
      <RotateCcw className="h-3 w-3" />
      Red Team
    </button>
  );

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-red-400">🔴 Contre-perspective</span>
        <div className="flex gap-2">
          <button onClick={generate} className="text-[10px] text-red-400/60 hover:text-red-400">Régénérer</button>
          <button onClick={() => { onUse(result); setOpen(false); }} className="text-[10px] text-emerald-400 hover:underline">Utiliser</button>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <p className="text-xs text-red-300/80 leading-relaxed">{result}</p>
    </div>
  );
}

function PromptEditor({
  initial, onSave, onCancel, busy,
}: {
  initial?: Partial<Prompt>;
  onSave: (data: Partial<Prompt>) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState<PromptCategory>(initial?.category ?? "other");
  const [modelHint, setModelHint] = useState(initial?.model_hint ?? "");
  const [temp, setTemp] = useState<string>(initial?.temperature?.toString() ?? "");
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card/30 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Titre du prompt *"
          className="col-span-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select value={category} onChange={e => setCategory(e.target.value as PromptCategory)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <input
          value={modelHint} onChange={e => setModelHint(e.target.value)}
          placeholder="Modèle cible (ex: gpt-4o, gemini-2.0)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Contenu</label>
          <CharCount text={content} />
        </div>
        <textarea
          value={content} onChange={e => setContent(e.target.value)}
          placeholder="Écrivez votre prompt ici…"
          rows={10}
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
      </div>

      {content.length > 50 && (
        <RedTeamPanel content={content} onUse={t => setContent(prev => prev + "\n\n// Red Team:\n" + t)} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={temp} onChange={e => setTemp(e.target.value)}
          placeholder="Température (0.0 – 2.0)"
          type="number" min="0" max="2" step="0.1"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          value={tags} onChange={e => setTags(e.target.value)}
          placeholder="Tags (virgule)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
          Annuler
        </button>
        <button
          onClick={() => onSave({
            title, content, category,
            model_hint: modelHint || null,
            temperature: temp ? parseFloat(temp) : null,
            tags: tags.split(",").map(t => t.trim()).filter(Boolean),
          })}
          disabled={busy || !title.trim() || !content.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {busy ? "…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function PromptCard({
  prompt, onSelect, selected, onDelete, onCopy,
}: {
  prompt: Prompt;
  onSelect: () => void;
  selected: boolean;
  onDelete: () => void;
  onCopy: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-border/50 bg-card/20 hover:border-border hover:bg-card/40",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CatBadge cat={prompt.category} />
            <span className="text-sm font-medium truncate">{prompt.title}</span>
          </div>
          <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground leading-relaxed">
            {prompt.content.slice(0, 120)}…
          </p>
          {(prompt.tags ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(prompt.tags ?? []).map(t => (
                <span key={t} className="flex items-center gap-0.5 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" />{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {prompt.use_count} utilisations
        </span>
        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
          <button onClick={onCopy} className="rounded p-1 text-muted-foreground/40 hover:bg-muted/30 hover:text-foreground">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded p-1 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </button>
  );
}

export default function Studio() {
  const qc = useQueryClient();
  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const [tab, setTab] = useState<"prompts" | "templates" | "tools">("prompts");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<PromptCategory | "">("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [addingTool, setAddingTool] = useState(false);
  const [toolVals, setToolVals] = useState<Record<string, string>>({});
  const [tmplVals, setTmplVals] = useState<Record<string, string>>({});

  const prompts   = useQuery({ queryKey: ["prompts"], queryFn: () => listPrompts() });
  const templates = useQuery({ queryKey: ["prompt_templates"], queryFn: listTemplates });
  const tools     = useQuery({ queryKey: ["tool_defs"], queryFn: listTools });

  const createMut = useMutation({
    mutationFn: createPrompt,
    onSuccess: () => { toast.success("Prompt créé"); inv(["prompts"]); setCreating(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Prompt> }) => updatePrompt(id, patch),
    onSuccess: () => { toast.success("Sauvegardé"); inv(["prompts"]); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const deleteMut = useMutation({
    mutationFn: deletePrompt,
    onSuccess: () => { inv(["prompts"]); setSelectedId(null); toast.success("Supprimé"); },
  });
  const createTmplMut = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => { toast.success("Template créé"); inv(["prompt_templates"]); setAddingTemplate(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const createToolMut = useMutation({
    mutationFn: createTool,
    onSuccess: () => { toast.success("Outil créé"); inv(["tool_defs"]); setAddingTool(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });
  const updateToolMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ToolDefinition> }) => updateTool(id, patch),
    onSuccess: () => { inv(["tool_defs"]); },
  });

  const allPrompts = prompts.data ?? [];
  const filtered = allPrompts
    .filter(p => !catFilter || p.category === catFilter)
    .filter(p => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()));

  const selectedPrompt = selectedId ? allPrompts.find(p => p.id === selectedId) : null;

  const TABS = [
    { id: "prompts", label: `Prompts (${allPrompts.length})` },
    { id: "templates", label: `Templates (${(templates.data ?? []).length})` },
    { id: "tools", label: `Outils (${(tools.data ?? []).length})` },
  ] as const;

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Studio</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Bibliothèque de prompts, templates et définitions d'outils AI.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── PROMPTS ──────────────────────────────────────────────────── */}
        {tab === "prompts" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <select value={catFilter} onChange={e => setCatFilter(e.target.value as PromptCategory | "")}
                className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">Toutes catégories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
              <button
                onClick={() => { setCreating(true); setEditing(null); }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau prompt
              </button>
            </div>

            {creating && (
              <PromptEditor
                onSave={data => createMut.mutate({
                  title: data.title ?? "Prompt",
                  content: data.content ?? "",
                  category: data.category ?? "other",
                  model_hint: data.model_hint ?? null,
                  temperature: data.temperature ?? null,
                  tags: data.tags ?? null,
                })}
                onCancel={() => setCreating(false)}
                busy={createMut.isPending}
              />
            )}

            {editing && (
              <PromptEditor
                initial={editing}
                onSave={data => updateMut.mutate({ id: editing.id, patch: data })}
                onCancel={() => setEditing(null)}
                busy={updateMut.isPending}
              />
            )}

            {!creating && !editing && (
              filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground/60">
                  {search || catFilter ? "Aucun prompt correspondant." : "Bibliothèque vide. Créez votre premier prompt."}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map(p => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      selected={selectedId === p.id}
                      onSelect={() => {
                        setSelectedId(selectedId === p.id ? null : p.id);
                        setEditing(selectedId === p.id ? null : null);
                      }}
                      onDelete={() => deleteMut.mutate(p.id)}
                      onCopy={() => { navigator.clipboard.writeText(p.content); toast.success("Copié !"); }}
                    />
                  ))}
                </div>
              )
            )}

            {selectedPrompt && !editing && !creating && (
              <div className="rounded-xl border border-border/60 bg-card/30 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CatBadge cat={selectedPrompt.category} />
                    <h3 className="font-medium">{selectedPrompt.title}</h3>
                  </div>
                  <button
                    onClick={() => { setEditing(selectedPrompt); setSelectedId(null); }}
                    className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Modifier
                  </button>
                </div>
                <pre className="max-h-64 overflow-y-auto rounded-lg bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                  {selectedPrompt.content}
                </pre>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  {selectedPrompt.model_hint && <span>Modèle : {selectedPrompt.model_hint}</span>}
                  {selectedPrompt.temperature != null && <span>Temp : {selectedPrompt.temperature}</span>}
                  <span>{selectedPrompt.use_count} utilisations</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TEMPLATES ────────────────────────────────────────────────── */}
        {tab === "templates" && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <BookTemplate className="h-4 w-4 text-muted-foreground" />
                Templates réutilisables
              </h2>
              <button onClick={() => setAddingTemplate(v => !v)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau
              </button>
            </div>

            {addingTemplate && (
              <form onSubmit={e => {
                e.preventDefault();
                createTmplMut.mutate({
                  name: tmplVals.name || "Template",
                  description: tmplVals.description || null,
                  template: tmplVals.template || "",
                  category: (tmplVals.category as PromptCategory) || "other",
                });
              }}
                className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={tmplVals.name ?? ""} onChange={e => setTmplVals(v => ({ ...v, name: e.target.value }))}
                    placeholder="Nom du template *"
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select value={tmplVals.category ?? "other"} onChange={e => setTmplVals(v => ({ ...v, category: e.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                  <input value={tmplVals.description ?? ""} onChange={e => setTmplVals(v => ({ ...v, description: e.target.value }))}
                    placeholder="Description"
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none sm:col-span-2"
                  />
                  <textarea value={tmplVals.template ?? ""} onChange={e => setTmplVals(v => ({ ...v, template: e.target.value }))}
                    placeholder="Template avec {{variables}} entre doubles accolades"
                    rows={5}
                    className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y sm:col-span-2"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAddingTemplate(false)} className="px-3 py-1.5 text-xs text-muted-foreground">Annuler</button>
                  <button type="submit" disabled={createTmplMut.isPending} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    {createTmplMut.isPending ? "…" : "Créer"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {(templates.data ?? []).length === 0 && !addingTemplate && (
                <div className="py-8 text-center text-sm text-muted-foreground/60">Aucun template. Créez des modèles réutilisables.</div>
              )}
              {(templates.data ?? []).map((t: PromptTemplate) => (
                <div key={t.id} className="rounded-xl border border-border/50 bg-card/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CatBadge cat={t.category} />
                    <span className="font-medium text-sm">{t.name}</span>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mb-2">{t.description}</p>}
                  <pre className="max-h-32 overflow-y-auto rounded-md bg-muted/20 p-2 font-mono text-[11px] text-foreground whitespace-pre-wrap">
                    {t.template}
                  </pre>
                  {t.variables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.variables.map(v => (
                        <span key={v.key} className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                          {`{{${v.key}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TOOLS ────────────────────────────────────────────────────── */}
        {tab === "tools" && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Définitions d'outils AI
              </h2>
              <button onClick={() => setAddingTool(v => !v)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau
              </button>
            </div>

            {addingTool && (
              <form onSubmit={e => {
                e.preventDefault();
                createToolMut.mutate({
                  name: toolVals.name || "tool",
                  description: toolVals.description || "",
                  endpoint: toolVals.endpoint || null,
                  method: toolVals.method || "POST",
                });
              }}
                className="rounded-xl border border-border/60 bg-card/30 p-4 space-y-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={toolVals.name ?? ""} onChange={e => setToolVals(v => ({ ...v, name: e.target.value }))}
                    placeholder="Nom (snake_case) *"
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select value={toolVals.method ?? "POST"} onChange={e => setToolVals(v => ({ ...v, method: e.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option>
                  </select>
                  <input value={toolVals.description ?? ""} onChange={e => setToolVals(v => ({ ...v, description: e.target.value }))}
                    placeholder="Description pour le LLM *"
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none sm:col-span-2"
                  />
                  <input value={toolVals.endpoint ?? ""} onChange={e => setToolVals(v => ({ ...v, endpoint: e.target.value }))}
                    placeholder="Endpoint URL (optionnel)"
                    className="rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none sm:col-span-2"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAddingTool(false)} className="px-3 py-1.5 text-xs text-muted-foreground">Annuler</button>
                  <button type="submit" disabled={createToolMut.isPending} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    {createToolMut.isPending ? "…" : "Créer"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {(tools.data ?? []).length === 0 && !addingTool && (
                <div className="py-8 text-center text-sm text-muted-foreground/60">Aucun outil défini.</div>
              )}
              {(tools.data ?? []).map((t: ToolDefinition) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/20 p-4">
                  <Zap className="h-4 w-4 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{t.name}</span>
                      {t.method && (
                        <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{t.method}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                    {t.endpoint && <p className="font-mono text-[10px] text-primary/60 truncate">{t.endpoint}</p>}
                  </div>
                  <select value={t.status}
                    onChange={e => updateToolMut.mutate({ id: t.id, patch: { status: e.target.value as ToolDefinition["status"] } })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
                  >
                    <option value="draft">draft</option>
                    <option value="active">actif</option>
                    <option value="disabled">désactivé</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthedLayout>
  );
}
