import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useListConversations, useCreateConversation,
  useDeleteConversation, useListMessages,
  getListConversationsQueryKey, getListMessagesQueryKey,
} from "@workspace/api-client-react";
import type { Conversation, Message } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Send, Trash2, MessageSquare, ChevronLeft, Zap, Square,
  CheckCircle2, FolderOpen, UserPlus, Palette, Lightbulb, Shield,
  ArrowRight, Command, X, Wand2, Image, Film, Music, FileText,
  Bot, User, Search, Wifi, WifiOff, AlertCircle, RotateCcw, Sparkles,
  BrainCircuit, Database, Wrench, Loader2, MemoryStick,
  Brain, Eye, LayoutDashboard, GitBranch, Target, AlertTriangle,
  Check, ChevronRight, BarChart3, ListChecks, Scale, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

const MODES = [
  { value: "chat", label: "Conversation", icon: MessageSquare },
  { value: "chief_of_staff", label: "Chef de Cabinet", icon: Zap },
  { value: "decision", label: "Décision", icon: Lightbulb },
  { value: "red_team", label: "Red Team", icon: Shield },
  { value: "execution", label: "Exécution", icon: CheckCircle2 },
] as const;

type Mode = typeof MODES[number]["value"];

const modeColor: Record<Mode, string> = {
  chat: "text-blue-400 bg-blue-500/10",
  chief_of_staff: "text-violet-400 bg-violet-500/10",
  decision: "text-amber-400 bg-amber-500/10",
  red_team: "text-red-400 bg-red-500/10",
  execution: "text-emerald-400 bg-emerald-500/10",
};

const modeGradient: Record<Mode, string> = {
  chat: "from-blue-500/5 to-transparent",
  chief_of_staff: "from-violet-500/5 to-transparent",
  decision: "from-amber-500/5 to-transparent",
  red_team: "from-red-500/5 to-transparent",
  execution: "from-emerald-500/5 to-transparent",
};

/* ─── Thinking steps ─── */
const THINKING_STEPS = [
  { icon: BrainCircuit, text: "Analyse du contexte..." },
  { icon: Database, text: "Recherche dans la mémoire..." },
  { icon: Wrench, text: "Appel d'outils..." },
  { icon: Sparkles, text: "Génération de la réponse..." },
];

/* ─── Slash commands ─── */
const SLASH_COMMANDS = [
  { command: "/tâche", label: "Créer une tâche", icon: CheckCircle2, color: "text-emerald-400", example: "/tâche Appeler le client demain à 14h" },
  { command: "/projet", label: "Créer un projet", icon: FolderOpen, color: "text-blue-400", example: "/projet Refonte du site web" },
  { command: "/contact", label: "Ajouter un contact", icon: UserPlus, color: "text-violet-400", example: "/contact Jean Dupont, Acme Corp, jean@acme.com" },
  { command: "/studio", label: "Générer dans Studio", icon: Palette, color: "text-pink-400", example: "/studio image un portrait cyberpunk" },
  { command: "/décision", label: "Analyser une décision", icon: Lightbulb, color: "text-amber-400", example: "/décision Dois-je changer de fournisseur ?" },
];

/* ─── Tool call cards ─── */
interface ToolCall {
  name: string;
  result: string;
  status?: "pending" | "done" | "error";
  args?: Record<string, unknown>;
  step?: string;
  error?: string;
}

/* Tool icon mapping */
function getToolMeta(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("task") || lower.includes("tâche")) return { icon: CheckCircle2, label: "Tâche créée", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", link: "/travail", actionLabel: "Création d'une tâche..." };
  if (lower.includes("project") || lower.includes("projet")) return { icon: FolderOpen, label: "Projet créé", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", link: "/travail", actionLabel: "Création d'un projet..." };
  if (lower.includes("contact")) return { icon: UserPlus, label: "Contact ajouté", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", link: "/travail", actionLabel: "Ajout d'un contact..." };
  if (lower.includes("memory") || lower.includes("mémoire")) return { icon: MessageSquare, label: "Mémoire enregistrée", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", link: "/systeme", actionLabel: "Enregistrement mémoire..." };
  if (lower.includes("decision") || lower.includes("décision")) return { icon: Lightbulb, label: "Décision analysée", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", link: "/systeme", actionLabel: "Création d'une décision..." };
  if (lower.includes("image") || lower.includes("studio")) return { icon: Image, label: "Asset Studio créé", color: "bg-pink-500/10 text-pink-400 border-pink-500/20", link: "/studio", actionLabel: "Génération Studio..." };
  if (lower.includes("briefing")) return { icon: BarChart3, label: "Briefing du jour", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", link: "/systeme", actionLabel: "Récupération du briefing..." };
  if (lower.includes("update_task_status")) return { icon: ListChecks, label: "Statut mis à jour", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", link: "/travail", actionLabel: "Mise à jour du statut..." };
  if (lower.includes("project_contact")) return { icon: UserPlus, label: "Contact lié au projet", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", link: "/travail", actionLabel: "Liaison contact-projet..." };
  if (lower.includes("reminder") || lower.includes("rappel")) return { icon: BrainCircuit, label: "Rappel programmé", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", link: undefined, actionLabel: "Programmation du rappel..." };
  return { icon: Zap, label: "Action effectuée", color: "bg-primary/10 text-primary border-primary/20", link: undefined, actionLabel: "Exécution..." };
}

/* Enriched Tool Call Card with animation */
function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isHovered, setIsHovered] = useState(false);
  const meta = getToolMeta(tool.name);
  const isDone = tool.status === "done" || (!tool.status && tool.result);
  const isPending = tool.status === "pending";
  const isError = tool.status === "error";

  function handleClick() {
    if (meta.link && !isError) {
      navigate(meta.link);
      toast({ title: `Ouverture : ${meta.label}` });
    }
  }

  return (
    <div className="w-full mt-2">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={isError}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-300 hover-lift",
          meta.color,
          meta.link && !isError && "hover:shadow-sm cursor-pointer",
          isHovered && meta.link && !isError && "scale-[1.01]",
          isPending && "animate-pulse",
          isError && "border-red-500/30 bg-red-500/5 cursor-default"
        )}
      >
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500",
          isDone ? "bg-emerald-500/20" : isError ? "bg-red-500/20" : "bg-current/10"
        )}>
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isDone ? (
            <Check className="w-4 h-4 text-emerald-400 animate-scale-in" />
          ) : isError ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : (
            <meta.icon className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            {isPending ? (tool.step || meta.actionLabel) : isError ? "Erreur" : meta.label}
            {isDone && (
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/20">
                <Check className="w-2.5 h-2.5 text-emerald-400" />
              </span>
            )}
          </div>
          <div className="text-[10px] opacity-80 truncate">
            {isError ? tool.error : tool.result}
          </div>
        </div>
        {meta.link && !isError && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] opacity-60 transition-all duration-300",
            isHovered && "opacity-100 translate-x-0"
          )}>
            <span className="hidden sm:inline">Voir</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        )}
      </button>

      {/* Error detail card */}
      {isError && (
        <div className="mt-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 animate-scale-in">
          <div className="text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="flex-1">{tool.error || "Une erreur est survenue lors de l'exécution de l'outil."}</span>
          </div>
          <button
            className="mt-2 text-[10px] px-2.5 py-1 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors"
            onClick={() => window.location.reload()}
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Quick action buttons ─── */
function QuickActions({ mode, onAction }: { mode: Mode; onAction: (text: string) => void }) {
  const actions: Record<Mode, { label: string; icon: React.ElementType; text: string }[]> = {
    chat: [
      { label: "Créer tâche", icon: CheckCircle2, text: "Crée une tâche pour moi" },
      { label: "Nouveau projet", icon: FolderOpen, text: "Crée un nouveau projet" },
      { label: "Générer image", icon: Image, text: "Génère une image de..." },
    ],
    chief_of_staff: [
      { label: "Briefing du jour", icon: Zap, text: "Quel est mon briefing du jour ?" },
      { label: "Priorités", icon: CheckCircle2, text: "Quelles sont mes priorités ?" },
      { label: "Risques", icon: Shield, text: "Quels risques dois-je surveiller ?" },
    ],
    decision: [
      { label: "Analyser", icon: Lightbulb, text: "Aide-moi à décider : " },
      { label: "Pros/Cons", icon: FileText, text: "Liste les avantages et inconvénients de..." },
      { label: "Recommandation", icon: Zap, text: "Que me recommandes-tu ?" },
    ],
    red_team: [
      { label: "Vérifier", icon: Shield, text: "Analyse les risques de..." },
      { label: "Challenge", icon: Zap, text: "Qu'est-ce qui pourrait mal tourner ?" },
      { label: "Alternatives", icon: Lightbulb, text: "Quelles sont les alternatives ?" },
    ],
    execution: [
      { label: "Créer tâche", icon: CheckCircle2, text: "/tâche " },
      { label: "Créer projet", icon: FolderOpen, text: "/projet " },
      { label: "Ajouter contact", icon: UserPlus, text: "/contact " },
    ],
  };

  const list = actions[mode] ?? actions.chat;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {list.map(a => (
        <button
          key={a.label}
          onClick={() => onAction(a.text)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/80 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label={a.label}
        >
          <a.icon className="w-3 h-3" />
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Slash command picker ─── */
function SlashCommandPicker({ query, onSelect, onClose }: { query: string; onSelect: (cmd: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const filtered = SLASH_COMMANDS.filter(c => c.command.includes(query.toLowerCase()));

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(p => Math.min(p + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected(p => Math.max(p - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); onSelect(filtered[selected]?.command ?? ""); }
      if (e.key === "Escape") { onClose(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [filtered, selected, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
      {filtered.map((cmd, i) => (
        <button
          key={cmd.command}
          onClick={() => onSelect(cmd.command)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
            i === selected ? "bg-accent" : "hover:bg-accent/50"
          )}
        >
          <cmd.icon className={cn("w-4 h-4 shrink-0", cmd.color)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">{cmd.command}</span>
              <span className="text-[10px] text-muted-foreground">{cmd.label}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/70 truncate">{cmd.example}</p>
          </div>
          {i === selected && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
        </button>
      ))}
    </div>
  );
}

/* ─── Date separator ─── */
function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  let label: string;
  if (isToday(d)) label = "Aujourd'hui";
  else if (isYesterday(d)) label = "Hier";
  else label = format(d, "EEEE d MMMM", { locale: fr });

  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ─── Thinking indicator ─── */
function ThinkingIndicator({ steps }: { steps: string[] }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-secondary/60 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-foreground border border-border/50">
        <div className="flex items-center gap-2 mb-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Réflexion...</span>
        </div>
        <div className="space-y-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Typing indicator with wave ─── */
function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center py-1">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-wave"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

/* ─── Action status bar ─── */
function ActionStatusBar({
  mode,
  messageCount,
  isStreaming,
  isError,
  onRetry,
  onNewConversation,
}: {
  mode: Mode;
  messageCount: number;
  isStreaming: boolean;
  isError: boolean;
  onRetry: () => void;
  onNewConversation: () => void;
}) {
  const modeLabel = MODES.find(m => m.value === mode)?.label ?? "Conversation";
  const ModeIcon = MODES.find(m => m.value === mode)?.icon ?? MessageSquare;

  return (
    <div className="shrink-0 px-4 py-1.5 border-b border-border/50 bg-sidebar/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className={cn("flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full", modeColor[mode] ?? modeColor.chat)}>
          <ModeIcon className="w-3 h-3" />
          <span>{modeLabel}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MessageSquare className="w-3 h-3" />
          <span>{messageCount} message{messageCount !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex-1" />
        {isError ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-destructive">
              <WifiOff className="w-3 h-3" />
              <span>Erreur de connexion</span>
            </div>
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Réessayer
            </button>
            <button
              onClick={onNewConversation}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
              Nouvelle
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>Connecté</span>
          </div>
        )}
        {isStreaming && (
          <div className="w-24">
            <Progress value={undefined} className="h-1" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Memory badge ─── */
function MemoryBadge({ count, memories, onToggleContext }: { count: number; memories: string[]; onToggleContext?: () => void }) {
  if (count === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggleContext}
            className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors"
          >
            <MemoryStick className="w-3 h-3" />
            <span>Mémoire : {count} élément{count !== 1 ? "s" : ""}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold text-[10px] uppercase tracking-wider opacity-70">Mémoires utilisées</p>
            {memories.map((m, i) => (
              <p key={i} className="text-[10px] truncate">{m}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─── Context Panel (Memory sidebar) ─── */
interface MemoryItem {
  id: string;
  type: string;
  content: string;
  relevance: number;
}

function ContextPanel({
  isOpen,
  onClose,
  memories,
}: {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
}) {
  const [, navigate] = useLocation();

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-20 flex flex-col animate-slide-in shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold">Contexte</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {memories.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Aucun contexte mémoire actif</p>
          </div>
        ) : (
          memories.map((mem) => (
            <div
              key={mem.id}
              className="p-3 rounded-xl bg-secondary/50 border border-border/50 hover:border-border transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                  mem.type === "task" && "bg-emerald-500/10 text-emerald-400",
                  mem.type === "project" && "bg-blue-500/10 text-blue-400",
                  mem.type === "contact" && "bg-violet-500/10 text-violet-400",
                  mem.type === "decision" && "bg-amber-500/10 text-amber-400",
                  mem.type === "memory" && "bg-orange-500/10 text-orange-400",
                  !["task","project","contact","decision","memory"].includes(mem.type) && "bg-primary/10 text-primary"
                )}>
                  {mem.type}
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-1 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${mem.relevance * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{Math.round(mem.relevance * 100)}%</span>
                </div>
              </div>
              <p className="text-xs text-foreground/80 line-clamp-3">{mem.content}</p>
            </div>
          ))
        )}
      </div>
      <div className="p-4 border-t border-border">
        <button
          onClick={() => { onClose(); navigate("/systeme"); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5" />
          Voir dans le graphe
        </button>
      </div>
    </div>
  );
}

/* ─── Structured Content Renderer ─── */
function StructuredContent({ content }: { content: string }) {
  // Le parseur markdown maison peut rencontrer du contenu partiel (streaming) ou
  // malformé. On ne laisse JAMAIS une erreur de parsing casser le Chat : repli
  // sur du texte brut. (Le rendu lui-même est protégé par l'ErrorBoundary global.)
  const blocks = useMemo(() => {
    try {
      return parseContent(content);
    } catch {
      return [{ type: "text" as const, content }];
    }
  }, [content]);

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <ContentBlock key={i} block={block} />
      ))}
    </div>
  );
}

interface ContentBlockType {
  type: "text" | "code" | "table" | "quote" | "list" | "heading";
  content: string;
  language?: string;
  headers?: string[];
  rows?: string[][];
  items?: string[];
  level?: number;
}

function parseContent(content: string): ContentBlockType[] {
  const blocks: ContentBlockType[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", content: codeLines.join("\n"), language: lang });
      i++;
      continue;
    }

    // Quote block
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "quote", content: quoteLines.join("\n") });
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|-")) {
      const headers = line.split("|").map(h => h.trim()).filter(Boolean);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i].split("|").map(c => c.trim()).filter(Boolean);
        if (row.length > 0) rows.push(row);
        i++;
      }
      blocks.push({ type: "table", content: "", headers, rows });
      continue;
    }

    // Heading
    if (line.match(/^#{1,3}\s/)) {
      const level = line.match(/^(#+)/)?.[0].length ?? 1;
      blocks.push({ type: "heading", content: line.replace(/^#{1,3}\s/, ""), level });
      i++;
      continue;
    }

    // List
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) {
        items.push(lines[i].replace(/^[-*\d\.\s]+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items });
      continue;
    }

    // Regular text
    if (line.trim()) {
      const textLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !lines[i].startsWith("> ") && !lines[i].match(/^[-*]\s/) && !lines[i].match(/^\d+\.\s/)) {
        textLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "text", content: textLines.join("\n") });
      continue;
    }

    i++;
  }

  return blocks;
}

/* Simple syntax highlighting */
function highlightCode(code: string, language?: string): React.ReactNode {
  const keywords = ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "from", "export", "default", "class", "extends", "async", "await", "try", "catch", "new", "this", "typeof"];
  const strings = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
  const comments = /\/\/.*$/gm;
  const numbers = /\b\d+\.?\d*\b/g;

  let highlighted = code;

  // Comments (must be first)
  highlighted = highlighted.replace(comments, match => `§COMMENT§${match}§END§`);

  // Strings
  highlighted = highlighted.replace(strings, match => `§STRING§${match}§END§`);

  // Numbers
  highlighted = highlighted.replace(numbers, match => `§NUMBER§${match}§END§`);

  // Keywords
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "g");
    highlighted = highlighted.replace(regex, match => `§KEYWORD§${match}§END§`);
  });

  // Split and render
  const parts = highlighted.split(/(§\w+§|§END§)/);
  let currentClass = "";

  return parts.map((part, i) => {
    if (part === "§COMMENT§") { currentClass = "text-muted-foreground italic"; return null; }
    if (part === "§STRING§") { currentClass = "text-emerald-400"; return null; }
    if (part === "§NUMBER§") { currentClass = "text-amber-400"; return null; }
    if (part === "§KEYWORD§") { currentClass = "text-violet-400 font-semibold"; return null; }
    if (part === "§END§") { currentClass = ""; return null; }
    return <span key={i} className={currentClass}>{part}</span>;
  });
}

function ContentBlock({ block }: { block: ContentBlockType }) {
  switch (block.type) {
    case "code":
      return (
        <div className="rounded-xl overflow-hidden bg-[#1e1e2e] border border-border/50 my-2">
          <div className="flex items-center justify-between px-3 py-2 bg-[#252537] border-b border-border/30">
            <span className="text-[10px] text-muted-foreground font-mono">{block.language || "code"}</span>
            <span className="text-[10px] text-muted-foreground/50">{block.content.split("\n").length} lignes</span>
          </div>
          <pre className="px-3 py-2 overflow-x-auto text-xs font-mono leading-relaxed">
            <code>{highlightCode(block.content, block.language)}</code>
          </pre>
        </div>
      );

    case "table":
      return (
        <div className="overflow-x-auto my-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {block.headers?.map((h, j) => (
                  <th key={j} className="text-left px-2 py-1.5 text-muted-foreground font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows?.map((row, ri) => (
                <tr key={ri} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "quote":
      return (
        <blockquote className="border-l-2 border-violet-400/60 pl-3 py-1 my-2 text-sm text-foreground/80 italic bg-violet-500/5 rounded-r-lg">
          {block.content}
        </blockquote>
      );

    case "heading":
      const Tag = `h${Math.min(block.level ?? 1, 3)}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag className={cn(
          "font-semibold text-foreground mt-3 mb-1",
          block.level === 1 && "text-base",
          block.level === 2 && "text-sm",
          block.level === 3 && "text-xs"
        )}>
          {block.content}
        </Tag>
      );

    case "list":
      return (
        <ul className="space-y-1 my-1">
          {block.items?.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm">
              <span className="w-1 h-1 rounded-full bg-primary/60 mt-2 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    default:
      return <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{block.content}</p>;
  }
}

/* ─── Mode-specific inline widgets ─── */

/* Chief of Staff mini-dashboard */
function ChiefOfStaffWidget({ content }: { content: string }) {
  const priorities = extractSection(content, ["priorité", "priorities", "important"]);
  const risks = extractSection(content, ["risque", "risks", "danger"]);
  const actions = extractSection(content, ["action", "tâche", "task", "à faire"]);

  return (
    <div className="mt-3 space-y-2">
      {(priorities.length > 0 || risks.length > 0 || actions.length > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {priorities.length > 0 && (
            <div className="p-2.5 rounded-xl bg-violet-500/5 border border-violet-500/10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target className="w-3 h-3 text-violet-400" />
                <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Priorités</span>
              </div>
              <ul className="space-y-1">
                {priorities.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                    <ChevronRight className="w-2.5 h-2.5 text-violet-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {risks.length > 0 && (
            <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Risques</span>
              </div>
              <ul className="space-y-1">
                {risks.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                    <ChevronRight className="w-2.5 h-2.5 text-red-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {actions.length > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ListChecks className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Actions</span>
              </div>
              <ul className="space-y-1">
                {actions.slice(0, 3).map((a, i) => (
                  <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                    <ChevronRight className="w-2.5 h-2.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* Decision inline form widget */
function DecisionWidget({ content }: { content: string }) {
  const pros = extractSection(content, ["pour", "pros", "avantage", "bénéfice", "positif"]);
  const cons = extractSection(content, ["contre", "cons", "inconvénient", "risque", "négatif"]);

  return (
    <div className="mt-3 space-y-2">
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {pros.length > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Pour</span>
              </div>
              <ul className="space-y-1">
                {pros.slice(0, 4).map((p, i) => (
                  <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-2 h-2 text-emerald-400" />
                    </span>
                    <span className="line-clamp-2">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cons.length > 0 && (
            <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <X className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Contre</span>
              </div>
              <ul className="space-y-1">
                {cons.slice(0, 4).map((c, i) => (
                  <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <X className="w-2 h-2 text-red-400" />
                    </span>
                    <span className="line-clamp-2">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Red Team widget */
function RedTeamWidget({ content }: { content: string }) {
  const challenges = extractSection(content, ["challenge", "problème", "risque", "faille", "weakness"]);
  const mitigations = extractSection(content, ["mitigation", "solution", "contre-mesure", "alternative"]);

  return (
    <div className="mt-3 space-y-2">
      {challenges.length > 0 && (
        <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Points de vigilance</span>
          </div>
          <ul className="space-y-1">
            {challenges.slice(0, 4).map((c, i) => (
              <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                <AlertTriangle className="w-2.5 h-2.5 text-red-400 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mitigations.length > 0 && (
        <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Check className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Recommandations</span>
          </div>
          <ul className="space-y-1">
            {mitigations.slice(0, 4).map((m, i) => (
              <li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* Execution widget - task list */
function ExecutionWidget({ content }: { content: string }) {
  const tasks = extractSection(content, ["tâche", "task", "créé", "ajouté", "action"]);

  return (
    <div className="mt-3">
      {tasks.length > 0 && (
        <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
          <div className="flex items-center gap-1.5 mb-2">
            <ListChecks className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Tâches créées</span>
          </div>
          <div className="space-y-1.5">
            {tasks.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] text-foreground/80 bg-emerald-500/5 rounded-lg px-2 py-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-[8px] font-bold text-emerald-400">
                  {i + 1}
                </span>
                <span className="line-clamp-1">{t}</span>
                <Check className="w-2.5 h-2.5 text-emerald-400 ml-auto shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Helper to extract sections from content */
function extractSection(content: string, keywords: string[]): string[] {
  const lines = content.split("\n");
  const results: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeader = keywords.some(k => lower.includes(k)) && (line.match(/^#{1,3}\s/) || line.match(/^[-*]\s/) || line.match(/^\d+\.\s/));

    if (isHeader) {
      inSection = true;
      const cleaned = line.replace(/^#{1,3}\s|^[-*\d\.\s]+/, "").trim();
      if (cleaned) results.push(cleaned);
    } else if (inSection && line.trim() && !line.match(/^#{1,3}\s/)) {
      if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
        const cleaned = line.replace(/^[-*\d\.\s]+/, "").trim();
        if (cleaned) results.push(cleaned);
      } else {
        inSection = false;
      }
    } else if (line.match(/^#{1,3}\s/)) {
      inSection = false;
    }
  }

  // Also try to find bullet points near keywords
  if (results.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (keywords.some(k => lower.includes(k))) {
        // Look ahead for list items
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (lines[j].match(/^[-*]\s/)) {
            results.push(lines[j].replace(/^[-*\s]+/, "").trim());
          }
        }
      }
    }
  }

  return results;
}

/* Mode widget dispatcher */
function ModeWidget({ mode, content }: { mode: Mode; content: string }) {
  switch (mode) {
    case "chief_of_staff":
      return <ChiefOfStaffWidget content={content} />;
    case "decision":
      return <DecisionWidget content={content} />;
    case "red_team":
      return <RedTeamWidget content={content} />;
    case "execution":
      return <ExecutionWidget content={content} />;
    default:
      return null;
  }
}

/* ─── Message bubble with premium design ─── */
function MessageBubble({
  msg,
  mode,
  onQuickAction,
}: {
  msg: Message;
  mode: Mode;
  onQuickAction: (text: string) => void;
}) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-2 animate-slide-up", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="relative shrink-0">
          <Avatar className="w-7 h-7 mt-1 ring-2 ring-primary/20 animate-pulse-soft">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[10px]">
              <Bot className="w-3.5 h-3.5" />
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background" />
        </div>
      )}
      <div className={cn(
        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm relative overflow-hidden transition-all duration-300 hover:shadow-md",
        isUser
          ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-sm shadow-lg shadow-primary/10"
          : "bg-gradient-to-br from-secondary to-secondary/80 text-foreground rounded-bl-sm border border-border/50 shadow-sm hover:border-border/80"
      )}>
        {/* Subtle gradient overlay for assistant */}
        {!isUser && (
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30 pointer-events-none rounded-2xl rounded-bl-sm", modeGradient[mode] ?? modeGradient.chat)} />
        )}
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1">
            {isUser ? (
              <User className="w-3 h-3 opacity-60" />
            ) : (
              <span className="text-[10px] font-semibold text-primary/70">TAMS AI</span>
            )}
          </div>
          <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <StructuredContent content={msg.content} />
          </div>
          <div className={cn(
            "text-[10px] mt-1 text-right",
            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {formatTime(msg.createdAt)}
          </div>
          {!isUser && (
            <>
              <ModeWidget mode={mode} content={msg.content} />
              <QuickActions mode={mode} onAction={onQuickAction} />
            </>
          )}
        </div>
      </div>
      {isUser && (
        <Avatar className="w-7 h-7 mt-1 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
            <User className="w-3.5 h-3.5" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ─── Main Chat Component ─── */
export default function Chat() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showConvList, setShowConvList] = useState(true);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [newTitle, setNewTitle] = useState("");
  const [showNew, setShowNew] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [showSlashPicker, setShowSlashPicker] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [isError, setIsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [usedMemories, setUsedMemories] = useState<string[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [contextMemories, setContextMemories] = useState<MemoryItem[]>([]);

  const confirmActionRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: conversations = [], isLoading: convLoading } = useListConversations();
  const { data: messages = [], isLoading: msgsLoading } = useListMessages(selectedId!, {
    query: { enabled: !!selectedId } as { enabled: boolean; queryKey: readonly unknown[] },
  });

  const visibleMessages = useMemo(() => {
    if (messages.length <= visibleCount) return messages;
    return messages.slice(messages.length - visibleCount);
  }, [messages, visibleCount]);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((conv: Conversation) =>
      conv.title?.toLowerCase().includes(q) ||
      conv.lastMessage?.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const createConv = useCreateConversation({
    mutation: {
      onSuccess: (conv: Conversation) => {
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setSelectedId(conv.id);
        setShowConvList(false);
        setShowNew(false);
        setNewTitle("");
      },
    },
  });

  const deleteConv = useDeleteConversation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setSelectedId(null);
        setShowConvList(true);
        toast({ title: "Conversation supprimée" });
      },
    },
  });

  // Build context memories from usedMemories
  useEffect(() => {
    const items: MemoryItem[] = usedMemories.map((m, i) => {
      const type = m.includes("tâche") || m.includes("task") ? "task" :
        m.includes("projet") || m.includes("project") ? "project" :
        m.includes("contact") ? "contact" :
        m.includes("décision") || m.includes("decision") ? "decision" :
        "memory";
      return {
        id: `mem-${i}`,
        type,
        content: m.length > 120 ? m.slice(0, 120) + "..." : m,
        relevance: 0.7 + Math.random() * 0.3,
      };
    });
    setContextMemories(items);
  }, [usedMemories]);

  // Thinking steps animation
  useEffect(() => {
    if (!isStreaming) {
      setThinkingSteps([]);
      return;
    }
    let currentStep = 0;
    setThinkingSteps([]);
    const interval = setInterval(() => {
      // On garde l'ÉLÉMENT comme garde (et non l'index) : impossible d'accéder
      // à .text sur undefined → plus de crash "undefined is not an object".
      const step = THINKING_STEPS[currentStep];
      if (step) {
        setThinkingSteps(prev => [...prev, step.text]);
        currentStep++;
      } else {
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isStreaming]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, streamingContent, pendingUser, toolCalls, thinkingSteps]);

  // Detect slash commands
  useEffect(() => {
    if (message.startsWith("/")) {
      const spaceIdx = message.indexOf(" ");
      const query = spaceIdx === -1 ? message.slice(1) : message.slice(1, spaceIdx);
      setSlashQuery(query);
      setShowSlashPicker(true);
    } else {
      setShowSlashPicker(false);
      setSlashQuery("");
    }
  }, [message]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (isCmdOrCtrl && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowNew(true);
      }
      if (e.key === "Escape") {
        setShowSearch(false);
        setSearchQuery("");
        setShowContextPanel(false);
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const streamMessage = useCallback(async (content: string) => {
    if (!selectedId || !content.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamingContent("");
    setToolCalls([]);
    setPendingUser(content);
    setShowSlashPicker(false);
    setIsError(false);
    setLastFailedMessage(null);

    abortRef.current = new AbortController();
    let doneReceived = false;

    try {
      const res = await fetch(`${API_BASE}/api/conversations/${selectedId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "token") {
              setStreamingContent(prev => prev + event.content);
            } else if (event.type === "tool_start") {
              setToolCalls(prev => [...prev, { name: event.name, args: event.args, result: "", status: "pending" }]);
            } else if (event.type === "tool_progress") {
              setToolCalls(prev => prev.map(tc => tc.name === event.name ? { ...tc, step: event.step } : tc));
            } else if (event.type === "tool_done") {
              setToolCalls(prev => prev.map(tc => tc.name === event.name ? { ...tc, result: event.result, status: "done" } : tc));
            } else if (event.type === "tool_error") {
              setToolCalls(prev => prev.map(tc => tc.name === event.name ? { ...tc, error: event.error, status: "error" } : tc));
            } else if (event.type === "memory") {
              setUsedMemories(prev => [...prev, event.content]);
            } else if (event.type === "done") {
              doneReceived = true;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setIsError(true);
        setLastFailedMessage(content);
        toast({ title: "Erreur de connexion", description: "Impossible d'envoyer le message", variant: "destructive" });
      }
    } finally {
      if (doneReceived) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getListMessagesQueryKey(selectedId) }),
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
        ]).catch(() => {});
      }
      setIsStreaming(false);
      setStreamingContent("");
      setToolCalls([]);
      setPendingUser(null);
      setThinkingSteps([]);
    }
  }, [selectedId, isStreaming, qc, toast]);

  function handleSend() {
    if (!message.trim() || !selectedId || isStreaming) return;
    const content = message.trim();
    setMessage("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    streamMessage(content);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleRetry() {
    if (lastFailedMessage) {
      setIsError(false);
      streamMessage(lastFailedMessage);
    }
  }

  function handleNewConversation() {
    setIsError(false);
    setLastFailedMessage(null);
    setShowNew(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSlashPicker && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape")) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSlashSelect(cmd: string) {
    setMessage(cmd + " ");
    setShowSlashPicker(false);
    inputRef.current?.focus();
  }

  function handleQuickAction(text: string) {
    setMessage(text);
    inputRef.current?.focus();
  }

  const selectedConv = conversations.find((c: Conversation) => c.id === selectedId);
  const currentMode = (selectedConv?.mode as Mode) ?? mode;

  return (
    <TooltipProvider>
      <div className="flex flex-1 overflow-hidden animate-fade-in relative">
        {/* ── Conversation list ── */}
        <div className={cn(
          "flex flex-col border-r border-border bg-sidebar",
          "absolute inset-0 z-10 md:relative md:inset-auto md:z-auto md:w-64 md:shrink-0",
          !showConvList && "hidden md:flex"
        )}>
          <div className="flex items-center justify-between px-4 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
            <button
              onClick={() => setShowNew(true)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors active:scale-[0.98]"
              aria-label="Nouvelle conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher... (Cmd+K)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-input border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setShowSearch(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {showNew && (
            <div className="px-3 py-2 border-b border-border bg-card">
              <div className="flex gap-1 flex-wrap mb-2">
                {MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                      mode === m.value ? "bg-primary text-primary-foreground" : cn("bg-secondary", modeColor[m.value])
                    )}
                    aria-pressed={mode === m.value}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <input
                autoFocus
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring mb-2"
                placeholder="Titre de la conversation..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newTitle.trim()) {
                    createConv.mutate({ data: { title: newTitle.trim(), mode } });
                  }
                  if (e.key === "Escape") { setShowNew(false); setNewTitle(""); }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { if (newTitle.trim()) createConv.mutate({ data: { title: newTitle.trim(), mode } }); }}
                  disabled={!newTitle.trim() || createConv.isPending}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                >
                  {createConv.isPending ? "Création..." : "Créer"}
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewTitle(""); }}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-secondary rounded-lg animate-pulse" />)}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "Aucune conversation trouvée" : "Aucune conversation"}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  {searchQuery ? "Essayez un autre terme de recherche" : "Créez une nouvelle conversation pour commencer"}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {filteredConversations.map((conv: Conversation) => (
                  <button
                    key={conv.id}
                    onClick={() => { setSelectedId(conv.id); setShowConvList(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 animate-slide-up",
                      selectedId === conv.id
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    style={{ animationDelay: `${(filteredConversations.indexOf(conv) % 8) * 0.04}s` }}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn("shrink-0 mt-0.5 px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide", modeColor[conv.mode as Mode] ?? modeColor.chat)}>
                        {MODES.find(m => m.value === conv.mode)?.label.slice(0, 4) ?? "Chat"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{conv.title}</div>
                        {conv.lastMessage && (
                          <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{conv.lastMessage}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Message area ── */}
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden",
          showConvList && "hidden md:flex"
        )}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-sidebar shrink-0">
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-accent text-muted-foreground"
              onClick={() => setShowConvList(true)}
              aria-label="Retour aux conversations"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {selectedConv ? (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{selectedConv.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className={cn("text-[10px] font-medium", modeColor[selectedConv.mode as Mode] ?? modeColor.chat)}>
                      {MODES.find(m => m.value === selectedConv.mode)?.label}
                    </div>
                    <MemoryBadge
                      count={usedMemories.length}
                      memories={usedMemories}
                      onToggleContext={() => setShowContextPanel(p => !p)}
                    />
                  </div>
                </div>
                <button
                  onClick={() => setShowContextPanel(p => !p)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors active:scale-[0.98] min-h-[44px] min-w-[44px] flex items-center justify-center",
                    showContextPanel ? "bg-violet-500/10 text-violet-400" : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  )}
                  aria-label="Contexte mémoire"
                  title="Contexte mémoire"
                >
                  <Brain className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    confirmActionRef.current = () => deleteConv.mutate({ id: selectedConv.id });
                    setConfirmOpen(true);
                  }}
                  className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors active:scale-[0.98] min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Supprimer la conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Sélectionner une conversation</div>
            )}
          </div>

          {/* Action Status Bar */}
          {selectedConv && (
            <ActionStatusBar
              mode={selectedConv.mode as Mode ?? "chat"}
              messageCount={messages.length}
              isStreaming={isStreaming}
              isError={isError}
              onRetry={handleRetry}
              onNewConversation={handleNewConversation}
            />
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0" aria-live="polite">
            {!selectedId ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-primary/60" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-background animate-pulse" />
                </div>
                <p className="text-sm text-muted-foreground">Sélectionne ou crée une conversation</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Tape / pour voir les commandes</p>
                <div className="flex gap-2 mt-4">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-secondary/50 px-2 py-1 rounded">
                    <Command className="w-3 h-3" />
                    <span>K Recherche</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 bg-secondary/50 px-2 py-1 rounded">
                    <Command className="w-3 h-3" />
                    <span>N Nouvelle</span>
                  </div>
                </div>
              </div>
            ) : msgsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                    <div className="h-10 w-48 bg-secondary rounded-xl animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {visibleMessages.map((msg: Message, idx: number) => {
                  const showDate = idx === 0 || !isSameDay(new Date(msg.createdAt), new Date(visibleMessages[idx - 1]?.createdAt));
                  return (
                    <div key={msg.id}>
                      {showDate && <DateSeparator date={msg.createdAt} />}
                      <MessageBubble
                        msg={msg}
                        mode={currentMode}
                        onQuickAction={handleQuickAction}
                      />
                    </div>
                  );
                })}

                {/* Optimistic user bubble */}
                {pendingUser && (
                  <div className="flex justify-end gap-2 animate-fade-in">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/10">
                      <div className="flex items-center gap-1.5 mb-1">
                        <User className="w-3 h-3 opacity-60" />
                      </div>
                      <div className="whitespace-pre-wrap break-words">{pendingUser}</div>
                    </div>
                    <Avatar className="w-7 h-7 mt-1 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                        <User className="w-3.5 h-3.5" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                {messages.length > visibleCount && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setVisibleCount(c => c + 50)}
                      className="px-3 py-1.5 rounded-full bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Charger plus ({messages.length - visibleCount} restants)
                    </button>
                  </div>
                )}

                {/* Thinking indicator */}
                {isStreaming && thinkingSteps.length > 0 && !streamingContent && (
                  <ThinkingIndicator steps={thinkingSteps} />
                )}

                {/* Streaming assistant bubble */}
                {isStreaming && (
                  <div className="flex justify-start gap-2 animate-fade-in">
                    <div className="relative shrink-0">
                      <Avatar className="w-7 h-7 mt-1 ring-2 ring-primary/20 animate-pulse-soft">
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[10px]">
                          <Bot className="w-3.5 h-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background" />
                    </div>
                    <div className="max-w-[80%] bg-gradient-to-br from-secondary to-secondary/80 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-foreground border border-border/50 shadow-sm relative overflow-hidden">
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30 pointer-events-none rounded-2xl rounded-bl-sm", modeGradient[currentMode])} />
                      <div className="relative z-10">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-primary/70">TAMS AI</span>
                        </div>
                        {streamingContent ? (
                          <div className="whitespace-pre-wrap break-words">
                            <StructuredContent content={streamingContent} />
                            <span className="inline-block w-0.5 h-4 bg-foreground/50 ml-0.5 animate-pulse align-middle" />
                          </div>
                        ) : (
                          <TypingIndicator />
                        )}
                        {toolCalls.map((tool, i) => (
                          <ToolCallCard key={i} tool={tool} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error message in chat */}
                {isError && !isStreaming && (
                  <div className="flex justify-center my-4 animate-fade-in">
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-destructive mb-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Erreur de connexion</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">Impossible d'envoyer le message. Vérifiez votre connexion.</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={handleRetry}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Réessayer
                        </button>
                        <button
                          onClick={handleNewConversation}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Nouvelle conversation
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          {selectedId && (
            <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border bg-sidebar" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
              <div ref={inputContainerRef} className="relative">
                {showSlashPicker && (
                  <SlashCommandPicker
                    query={slashQuery}
                    onSelect={handleSlashSelect}
                    onClose={() => setShowSlashPicker(false)}
                  />
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      className="w-full bg-secondary rounded-xl px-3.5 py-2.5 pr-8 text-base text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[40px] max-h-32 border border-border/50 focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-all"
                      placeholder={isStreaming ? "En cours..." : "Envoyer un message... (tape / pour les commandes)"}
                      value={message}
                      enterKeyHint="send"
                      onChange={e => {
                        setMessage(e.target.value);
                        const el = e.target;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                      }}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      style={{ fontSize: "16px" }}
                    />
                    {message.startsWith("/") && (
                      <Command className="absolute right-2.5 top-3 w-3.5 h-3.5 text-muted-foreground/50" />
                    )}
                  </div>
                  {isStreaming ? (
                    <button
                      onClick={handleStop}
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-secondary text-foreground border border-border transition-all hover:bg-accent active:scale-[0.98]"
                      title="Arrêter la génération"
                      aria-label="Arrêter la génération"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!message.trim()}
                      className={cn(
                        "shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-all hover:bg-primary/90 active:scale-[0.98] shadow-lg shadow-primary/20 ripple-btn",
                        message.trim() && "animate-glow-pulse"
                      )}
                      aria-label="Envoyer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Context Panel */}
        <ContextPanel
          isOpen={showContextPanel}
          onClose={() => setShowContextPanel(false)}
          memories={contextMemories}
        />

        {/* Confirm Dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer la conversation</AlertDialogTitle>
              <AlertDialogDescription>Cette action est irréversible. Voulez-vous continuer ?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { confirmActionRef.current?.(); setConfirmOpen(false); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
