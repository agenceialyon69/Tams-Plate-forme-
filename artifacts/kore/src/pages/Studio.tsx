import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  listPrompts, createPrompt, updatePrompt, deletePrompt,
  listTemplates, createTemplate,
  listTools, createTool, updateTool,
  type Prompt, type PromptTemplate, type ToolDefinition,
  type PromptCategory,
} from "@/lib/studio";
import {
  Wand2, Plus, Search, Trash2, Copy, Tag, Zap,
  BookTemplate, Wrench, Save, RotateCcw, X,
  Image, Download, Loader2, RefreshCw, FileText,
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

  const [tab, setTab] = useState<"prompts" | "templates" | "tools" | "creation">("prompts");
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
    { id: "creation", label: "🎨 Création" },
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
        {/* ─── CRÉATION ─────────────────────────────────────────────────── */}
        {tab === "creation" && <CreationPanel />}

      </div>
    </AuthedLayout>
  );
}

// ─── Image generation + PDF export panel ─────────────────────────────────────

interface GeneratedImage {
  url: string;
  prompt: string;
  timestamp: string;
}

function CreationPanel() {
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfContent, setPdfContent] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [style, setStyle] = useState("realistic");

  const STYLES = [
    { id: "realistic", label: "Réaliste" },
    { id: "cinematic", label: "Cinématique" },
    { id: "illustration", label: "Illustration" },
    { id: "minimalist", label: "Minimaliste" },
    { id: "dark", label: "Dark & Moody" },
    { id: "corporate", label: "Corporate" },
  ];

  function buildPrompt(base: string, s: string): string {
    const suffixes: Record<string, string> = {
      realistic: "photorealistic, high quality, 8k",
      cinematic: "cinematic lighting, movie scene, dramatic",
      illustration: "digital illustration, vector art, clean lines",
      minimalist: "minimalist, white background, simple shapes",
      dark: "dark moody, noir, dramatic shadows, high contrast",
      corporate: "professional, clean, business, modern office",
    };
    return `${base}, ${suffixes[s] ?? ""}`;
  }

  async function generateImage() {
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    const fullPrompt = buildPrompt(imgPrompt.trim(), style);
    const seed = Math.floor(Math.random() * 99999);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=768&height=512&nologo=true&seed=${seed}`;
    setImages(prev => [{ url, prompt: fullPrompt, timestamp: new Date().toISOString() }, ...prev]);
    setImgLoading(false);
    toast.success("Image en cours de génération…");
  }

  async function exportPDF() {
    if (!pdfContent.trim()) { toast.error("Contenu requis"); return; }
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 60;
      const contentW = pageW - margin * 2;

      // Header
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, pageW, 80, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(pdfTitle || "Document KORE", margin, 50);

      // Metadata
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Généré par KORE — ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`, margin, 68);

      // Content
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(pdfContent, contentW);
      let y = 110;
      const lineH = 16;
      const pageH = doc.internal.pageSize.getHeight();

      for (const line of lines) {
        if (y + lineH > pageH - 60) {
          doc.addPage();
          y = 60;
        }
        doc.text(line, margin, y);
        y += lineH;
      }

      // Footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`KORE AI Operating System — Page ${i} / ${totalPages}`, margin, pageH - 30);
      }

      const filename = `${(pdfTitle || "document").toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.pdf`;
      doc.save(filename);
      toast.success(`PDF exporté : ${filename}`);
    } catch (e) {
      toast.error("Erreur d'export PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* ── Image Generator ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-rose-400" />
          <h2 className="text-sm font-medium">Génération d'images</h2>
          <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">Pollinations.ai</span>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/20 p-4 space-y-3">
          <textarea
            value={imgPrompt}
            onChange={e => setImgPrompt(e.target.value)}
            placeholder="Décrivez votre image… ex: bureau minimaliste avec laptop, lumière naturelle"
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <div className="flex flex-wrap gap-1.5">
            {STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  style === s.id ? "bg-primary text-primary-foreground" : "border border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button onClick={generateImage} disabled={!imgPrompt.trim() || imgLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
          >
            {imgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {imgLoading ? "Génération…" : "Générer"}
          </button>
        </div>

        {images.length > 0 && (
          <div className="space-y-3">
            {images.map((img, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card/10 p-3 space-y-2">
                <img
                  src={img.url}
                  alt={img.prompt}
                  loading="lazy"
                  className="w-full rounded-lg object-cover aspect-video"
                  onError={e => { (e.target as HTMLImageElement).alt = "Chargement…"; }}
                />
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed flex-1 line-clamp-2">{img.prompt}</p>
                  <a href={img.url} download={`kore-image-${i}.jpg`} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-border/50 p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {images.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/40 py-12 text-center">
            <Image className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground/50">Vos images générées apparaîtront ici</p>
            <p className="text-[10px] text-muted-foreground/30 mt-1">Gratuit · Sans clé API · Pollinations.ai</p>
          </div>
        )}
      </div>

      {/* ── PDF Export ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-medium">Export PDF</h2>
          <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400">jsPDF</span>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/20 p-4 space-y-3">
          <input
            value={pdfTitle}
            onChange={e => setPdfTitle(e.target.value)}
            placeholder="Titre du document"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <textarea
            value={pdfContent}
            onChange={e => setPdfContent(e.target.value)}
            placeholder="Contenu du document… Collez un rapport, compte-rendu, décision, analyse…"
            rows={14}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />

          <div className="rounded-lg bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-0.5">
            <p>• En-tête KORE avec couleur primaire indigo</p>
            <p>• Pagination automatique</p>
            <p>• Format A4 · Police Helvetica</p>
            <p>• Footer avec numéro de page</p>
          </div>

          <button onClick={exportPDF} disabled={!pdfContent.trim() || pdfBusy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-40"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {pdfBusy ? "Export…" : "Télécharger le PDF"}
          </button>
        </div>

        <div className="rounded-xl border border-border/40 bg-card/10 p-4">
          <p className="text-xs font-medium mb-2 text-muted-foreground">Modèles de contenu rapide</p>
          <div className="space-y-1.5">
            {[
              { label: "Compte-rendu de réunion", content: `COMPTE-RENDU DE RÉUNION\n\nDate : ${new Date().toLocaleDateString("fr-FR")}\nParticipants : \nObjet : \n\n## Décisions prises\n\n1. \n\n## Actions à suivre\n\n- \n\n## Prochaine étape\n\n` },
              { label: "Note de décision", content: `NOTE DE DÉCISION\n\nDate : ${new Date().toLocaleDateString("fr-FR")}\n\n## Contexte\n\n\n## Options analysées\n\n1. \n2. \n\n## Décision retenue\n\n\n## Justification\n\n\n## Critères de succès\n\n` },
              { label: "Rapport d'analyse", content: `RAPPORT D'ANALYSE\n\nDate : ${new Date().toLocaleDateString("fr-FR")}\n\n## Résumé exécutif\n\n\n## Analyse détaillée\n\n\n## Conclusions\n\n\n## Recommandations\n\n` },
            ].map(t => (
              <button key={t.label} onClick={() => { setPdfTitle(t.label); setPdfContent(t.content); }}
                className="w-full rounded-md border border-border/40 bg-background/50 px-3 py-2 text-left text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
