import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useListConversations, useCreateConversation,
  useDeleteConversation, useListMessages,
  getListConversationsQueryKey, getListMessagesQueryKey,
} from "@workspace/api-client-react";
import type { Conversation, Message } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Send, Trash2, MessageSquare, ChevronLeft, Zap, Square, Paperclip,
  CheckCircle2, FolderOpen, UserPlus, Palette, Lightbulb, Shield,
  ArrowRight, Command, X, Wand2, Image, Film, Music, FileText,
  Bot, User, Search, Wifi, WifiOff, AlertCircle, RotateCcw, Sparkles,
  BrainCircuit, Database, Wrench, Loader2, MemoryStick,
  Brain, Eye, LayoutDashboard, GitBranch, Target, AlertTriangle,
  Check, ChevronRight, BarChart3, ListChecks, Scale, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getRuntimeAccessToken } from "@/lib/supabase-session";
import {
  matchRuntimeCommand,
  requestRuntimeTask,
  RuntimeBridgeError,
} from "@/lib/runtime-chat-bridge";
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
          {!isError && typeof tool.result === "string" && tool.result.startsWith("IMAGE:") ? (
            <a href={tool.result.slice(6)} target="_blank" rel="noreferrer">
              <img
                src={tool.result.slice(6)}
                alt="Image générée"
                className="mt-1.5 rounded-lg w-full max-w-[220px] aspect-square object-cover border border-border"
                loading="lazy"
              />
            </a>
          ) : !isError && typeof tool.result === "string" && tool.result.startsWith("VIDEO:") ? (
            <video
              src={tool.result.slice(6)}
              controls
              playsInline
              className="mt-1.5 rounded-lg w-full max-w-[220px] aspect-[9/16] object-cover border border-border bg-black"
            />
          ) : !isError && typeof tool.result === "string" && tool.result.startsWith("AUDIO:") ? (
            <audio src={tool.result.slice(6)} controls className="mt-1.5 w-full max-w-[240px]" />
          ) : (
            <div className="text-[10px] opacity-80 truncate">
              {isError ? tool.error : tool.result}
            </div>
          )}
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

export default function Chat() {
  return <div>Loading...</div>;
}
