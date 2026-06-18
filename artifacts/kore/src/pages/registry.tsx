import { useState } from "react";
import { BookOpen, Search, Tag, User, Clock, Activity, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type EntryType = "agent" | "prompt" | "playbook" | "policy" | "workflow" | "provider" | "integration";

interface RegistryEntry {
  id: string;
  type: EntryType;
  name: string;
  description: string;
  owner: string;
  version: string;
  status: "active" | "draft" | "deprecated" | "disabled";
  sensitivity: "public" | "internal" | "restricted" | "critical";
  scope: string;
  lastChange: string;
}

const ENTRIES: RegistryEntry[] = [
  { id: "e1", type: "agent", name: "Scoring Agent", description: "Score les opportunités commerciales via Gemini.", owner: "system", version: "1.2.0", status: "active", sensitivity: "internal", scope: "commercial", lastChange: "2025-06-15" },
  { id: "e2", type: "agent", name: "Capture Agent", description: "Transcription et structuration des réunions.", owner: "system", version: "1.0.3", status: "active", sensitivity: "internal", scope: "capture", lastChange: "2025-06-10" },
  { id: "e3", type: "prompt", name: "Briefing System Prompt", description: "Prompt de génération de briefings commerciaux.", owner: "admin@gandal.local", version: "3.0.0", status: "active", sensitivity: "restricted", scope: "commercial", lastChange: "2025-06-17" },
  { id: "e4", type: "prompt", name: "Red Team Attack Prompt", description: "Prompt d'injection et de test adversarial.", owner: "admin@gandal.local", version: "1.1.0", status: "active", sensitivity: "critical", scope: "red-team", lastChange: "2025-06-12" },
  { id: "e5", type: "playbook", name: "Outbound Enterprise", description: "Séquence outbound pour les comptes enterprise.", owner: "admin@gandal.local", version: "2.0.0", status: "active", sensitivity: "internal", scope: "prospection", lastChange: "2025-06-08" },
  { id: "e6", type: "policy", name: "No Cross-Tenant Access", description: "Interdit toute lecture de données hors tenant.", owner: "system", version: "1.0.0", status: "active", sensitivity: "critical", scope: "global", lastChange: "2025-06-01" },
  { id: "e7", type: "policy", name: "Export Requires Role", description: "L'export de données nécessite le rôle member minimum.", owner: "system", version: "1.0.0", status: "active", sensitivity: "restricted", scope: "global", lastChange: "2025-06-01" },
  { id: "e8", type: "provider", name: "Google Gemini", description: "Provider IA principal pour génération et scoring.", owner: "system", version: "gemini-2.0-flash", status: "active", sensitivity: "restricted", scope: "ai", lastChange: "2025-06-01" },
  { id: "e9", type: "provider", name: "Groq Whisper", description: "Provider de transcription audio.", owner: "system", version: "whisper-large-v3", status: "active", sensitivity: "restricted", scope: "capture", lastChange: "2025-05-20" },
  { id: "e10", type: "workflow", name: "Approval Workflow", description: "Validation d'actions sensibles avant exécution.", owner: "system", version: "1.0.0", status: "draft", sensitivity: "restricted", scope: "global", lastChange: "2025-06-18" },
];

const TYPE_COLORS: Record<EntryType, string> = {
  agent: "bg-blue-500/10 text-blue-600 border-blue-200",
  prompt: "bg-violet-500/10 text-violet-600 border-violet-200",
  playbook: "bg-amber-500/10 text-amber-600 border-amber-200",
  policy: "bg-red-500/10 text-red-600 border-red-200",
  workflow: "bg-teal-500/10 text-teal-600 border-teal-200",
  provider: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  integration: "bg-green-500/10 text-green-600 border-green-200",
};

const SENSITIVITY_COLORS: Record<string, string> = {
  public: "bg-gray-100 text-gray-600",
  internal: "bg-blue-50 text-blue-600",
  restricted: "bg-amber-50 text-amber-600",
  critical: "bg-red-50 text-red-600",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-600",
  draft: "bg-gray-50 text-gray-500",
  deprecated: "bg-amber-50 text-amber-500",
  disabled: "bg-red-50 text-red-500",
};

const ALL_TYPES: EntryType[] = ["agent", "prompt", "playbook", "policy", "workflow", "provider", "integration"];

export default function Registry() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<EntryType | "all">("all");

  const filtered = ENTRIES.filter((e) => {
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
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-serif font-semibold">Registry Central</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tout ce que GANDAL sait faire — agents, prompts, playbooks, politiques, workflows, providers.
        </p>
      </div>

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
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} entrée{filtered.length > 1 ? "s" : ""}</div>

      <div className="space-y-3">
        {filtered.map((entry) => (
          <Card key={entry.id} className="border-border/50 hover:border-border transition-colors">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${TYPE_COLORS[entry.type]}`}>
                      {entry.type}
                    </span>
                    <span className="font-medium text-sm">{entry.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${STATUS_COLORS[entry.status]}`}>
                      {entry.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {entry.owner}
                    </span>
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" /> v{entry.version}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" /> {entry.scope}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {entry.lastChange}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${SENSITIVITY_COLORS[entry.sensitivity]}`}>
                      {entry.sensitivity}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Aucune entrée ne correspond à votre recherche.
          </div>
        )}
      </div>
    </div>
  );
}
