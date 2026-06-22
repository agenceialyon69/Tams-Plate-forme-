import { useState } from "react";
import { BookOpen, Search, Tag, User, Clock, Activity, Plus, Trash2, Pencil, X, Check, Loader2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type EntryType = "agent" | "prompt" | "playbook" | "policy" | "workflow" | "provider" | "integration" | "data_source";
type EntryStatus = "active" | "draft" | "deprecated" | "disabled";
type Sensitivity = "public" | "internal" | "restricted" | "critical";

interface RegistryEntry {
  id: number;
  tenantId: number;
  type: EntryType;
  name: string;
  description: string;
  owner: string;
  version: string;
  status: EntryStatus;
  sensitivity: Sensitivity;
  scope: string;
  config?: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_COLORS: Record<EntryType, string> = {
  agent: "bg-blue-500/10 text-blue-600 border-blue-200",
  prompt: "bg-violet-500/10 text-violet-600 border-violet-200",
  playbook: "bg-amber-500/10 text-amber-600 border-amber-200",
  policy: "bg-red-500/10 text-red-600 border-red-200",
  workflow: "bg-teal-500/10 text-teal-600 border-teal-200",
  provider: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  integration: "bg-green-500/10 text-green-600 border-green-200",
  data_source: "bg-pink-500/10 text-pink-600 border-pink-200",
};

const SENSITIVITY_COLORS: Record<Sensitivity, string> = {
  public: "bg-gray-100 text-gray-600",
  internal: "bg-blue-50 text-blue-600",
  restricted: "bg-amber-50 text-amber-600",
  critical: "bg-red-50 text-red-600",
};

const STATUS_COLORS: Record<EntryStatus, string> = {
  active: "bg-green-50 text-green-600",
  draft: "bg-gray-50 text-gray-500",
  deprecated: "bg-amber-50 text-amber-500",
  disabled: "bg-red-50 text-red-500",
};

const ALL_TYPES: EntryType[] = ["agent", "prompt", "playbook", "policy", "workflow", "provider", "integration", "data_source"];

const BLANK_FORM = {
  type: "agent" as EntryType,
  name: "",
  description: "",
  owner: "system",
  version: "1.0.0",
  status: "draft" as EntryStatus,
  sensitivity: "internal" as Sensitivity,
  scope: "global",
};

export default function Registry() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<EntryType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const user = getStoredUser();
  const canWrite = user?.role === "admin" || user?.role === "owner";

  const { data: entries = [], isLoading, error } = useQuery<RegistryEntry[]>({
    queryKey: ["registry"],
    queryFn: () => apiFetch<RegistryEntry[]>("/registry"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof BLANK_FORM) => apiFetch<RegistryEntry>("/registry", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registry"] });
      toast({ title: "Entrée créée" });
      setShowForm(false);
      setForm(BLANK_FORM);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/registry/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registry"] });
      toast({ title: "Entrée supprimée" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const filtered = entries.filter((e) => {
    const matchType = filterType === "all" || e.type === filterType;
    const matchSearch =
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.scope.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={BookOpen}
        title="Registry Central"
        subtitle="Tout ce que TAMS sait faire — agents, prompts, playbooks, politiques, workflows, providers."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? "Annuler" : "Nouvelle entrée"}
            </Button>
          ) : undefined
        }
      />

      {showForm && canWrite && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4 space-y-3">
            <h3 className="text-sm font-semibold">Nouvelle entrée</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EntryType }))}
                  className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background"
                >
                  {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Statut</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EntryStatus }))}
                  className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background"
                >
                  {["active", "draft", "deprecated", "disabled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Input placeholder="Nom" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Version (ex: 1.0.0)" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
              <Input placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="sm:col-span-2" />
              <Input placeholder="Owner (ex: system, admin@example.com)" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
              <Input placeholder="Scope (ex: global, commercial, ai)" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} />
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sensibilité</label>
                <select
                  value={form.sensitivity}
                  onChange={(e) => setForm((f) => ({ ...f, sensitivity: e.target.value as Sensitivity }))}
                  className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background"
                >
                  {["public", "internal", "restricted", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name.trim() || createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Créer
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher par nom, description, scope..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType("all")}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${filterType === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/30"}`}
          >
            Tout
          </button>
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors capitalize ${filterType === t ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/30"}`}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/5 rounded-lg border border-destructive/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Impossible de charger le registry.
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="text-xs text-muted-foreground">{filtered.length} entrée{filtered.length > 1 ? "s" : ""}</div>

          <div className="space-y-3">
            {filtered.map((entry) => (
              <Card key={entry.id} className="border-border/50 hover:border-border transition-colors">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${TYPE_COLORS[entry.type]}`}>
                          {entry.type.replace("_", " ")}
                        </span>
                        <span className="font-medium text-sm">{entry.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${STATUS_COLORS[entry.status]}`}>
                          {entry.status}
                        </span>
                      </div>
                      {entry.description && <p className="text-xs text-muted-foreground">{entry.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> {entry.owner}</span>
                        <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> v{entry.version}</span>
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {entry.scope}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(entry.updatedAt).toLocaleDateString("fr-FR")}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${SENSITIVITY_COLORS[entry.sensitivity]}`}>
                          {entry.sensitivity}
                        </span>
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        onClick={() => deleteMutation.mutate(entry.id)}
                        disabled={deleteMutation.isPending}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtered.length === 0 && !isLoading && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {entries.length === 0
                  ? "Registry vide — crée ta première entrée."
                  : "Aucune entrée ne correspond à ta recherche."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
