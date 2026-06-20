import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Home, Mic, CheckCircle2, BrainCircuit, Compass, MoonStar,
  Activity, BarChart2, Settings2, Radio, Users, FileText,
  Swords, Stethoscope, Search, ArrowRight, Download,
} from "lucide-react";
import { getToken } from "@/lib/auth";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  function go(path: string) {
    navigate(path);
    onOpenChange(false);
    setQuery("");
  }

  function exportData() {
    const token = getToken();
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    if (token) {
      fetch(`${base}/api/export`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `tams-export-${new Date().toISOString().split("T")[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
        });
    }
    onOpenChange(false);
    setQuery("");
  }

  const commands: CommandItem[] = [
    { id: "home", label: "Aperçu", description: "Tableau de bord principal", icon: Home, action: () => go("/"), keywords: ["dashboard", "accueil"] },
    { id: "capture", label: "Capture", description: "Nouvelle capture de pensée", icon: Mic, action: () => go("/capture"), keywords: ["note", "micro", "voix"] },
    { id: "tasks", label: "Tâches", description: "Gérer les tâches", icon: CheckCircle2, action: () => go("/tasks"), keywords: ["todo", "todo list"] },
    { id: "memory", label: "Mémoire", description: "Base de connaissances", icon: BrainCircuit, action: () => go("/memory"), keywords: ["notes", "savoir", "knowledge"] },
    { id: "decisions", label: "Décisions", description: "Analyse de décisions", icon: Compass, action: () => go("/decisions"), keywords: ["analyse", "choix"] },
    { id: "recordings", label: "Enregistrements", description: "Meeting intelligence", icon: Radio, action: () => go("/recordings"), keywords: ["réunion", "meeting", "audio"] },
    { id: "prospects", label: "Prospection", description: "Pipeline commercial", icon: Users, action: () => go("/prospects"), keywords: ["leads", "CRM", "commercial"] },
    { id: "evening", label: "Revue du soir", description: "Bilan quotidien", icon: MoonStar, action: () => go("/evening"), keywords: ["soir", "bilan", "review"] },
    { id: "overload", label: "Bien-être", description: "Détection de surcharge", icon: Activity, action: () => go("/overload"), keywords: ["burnout", "énergie", "santé"] },
    { id: "weekly", label: "Bilan hebdo", description: "Résumé de la semaine", icon: BarChart2, action: () => go("/weekly"), keywords: ["semaine", "weekly"] },
    { id: "audit", label: "Audit Trail", description: "Journal d'activité immuable", icon: FileText, action: () => go("/audit"), keywords: ["logs", "journal", "historique"] },
    { id: "red-team", label: "Red Team", description: "Tests de sécurité", icon: Swords, action: () => go("/red-team"), keywords: ["sécurité", "tests", "injection"] },
    { id: "diagnostics", label: "Diagnostics", description: "État du système", icon: Stethoscope, action: () => go("/diagnostics"), keywords: ["santé", "status", "health"] },
    { id: "settings", label: "Paramètres", description: "Configuration et provider IA", icon: Settings2, action: () => go("/settings"), keywords: ["config", "préférences"] },
    { id: "export", label: "Exporter les données", description: "Télécharger un export JSON complet", icon: Download, action: exportData, keywords: ["backup", "sauvegarde", "json"] },
  ];

  const filtered = query.trim()
    ? commands.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.label.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.keywords?.some((k) => k.toLowerCase().includes(q))
        );
      })
    : commands;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const [selected, setSelected] = useState(0);

  useEffect(() => { setSelected(0); }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selected]?.action();
      }
    },
    [filtered, selected],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 bg-card border-border overflow-hidden gap-0">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une page ou action…"
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground outline-none text-sm"
          />
          <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">Aucun résultat pour « {query} »</p>
          )}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            const isSelected = i === selected;
            return (
              <button
                key={cmd.id}
                onMouseEnter={() => setSelected(i)}
                onClick={cmd.action}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-accent/10 text-foreground" : "text-foreground/80 hover:bg-muted/40"}`}
              >
                <div className={`p-1.5 rounded-md ${isSelected ? "bg-accent/20" : "bg-muted"}`}>
                  <Icon className={`w-4 h-4 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cmd.label}</p>
                  {cmd.description && <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>}
                </div>
                {isSelected && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground/60">
          <span>↑↓ naviguer</span>
          <span>↵ sélectionner</span>
          <span>ESC fermer</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
