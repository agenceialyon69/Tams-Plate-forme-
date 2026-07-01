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

const THINKING_STEPS = [
  { icon: BrainCircuit, text: "Analyse du contexte..." },
  { icon: Database, text: "Recherche dans la mémoire..." },
  { icon: Wrench, text: "Appel d'outils..." },
  { icon: Sparkles, text: "Génération de la réponse..." },
];

const TAMS_CAN_DO = [
  { domain: "Analyse & Décision", icon: "brain", available: true, actions: [{ label: "Analyser une décision", prompt: "Aide-moi à décider : ", available: true }, { label: "Red Team / risques", prompt: "Qu'est-ce qui peut mal tourner avec ", available: true }, { label: "Interroger la mémoire", prompt: "Qu'est-ce que tu sais sur ", available: true }] },
  { domain: "Studio Créatif", icon: "palette", available: true, actions: [{ label: "Plan Studio", prompt: "/studio ", available: true }, { label: "Générer une image", prompt: "/image ", available: true }, { label: "Script / brief", prompt: "/script ", available: true }, { label: "Plan musique", prompt: "Crée un plan musical pour ", available: true }] },
  { domain: "Projets & Tâches", icon: "folder", available: true, actions: [{ label: "Créer un projet", prompt: "/projet ", available: true }, { label: "Créer une tâche", prompt: "/tâche ", available: true }, { label: "Ajouter un contact", prompt: "/contact ", available: true }] },
  { domain: "Système", icon: "monitor", available: true, actions: [{ label: "Santé système", prompt: "Vérifie la santé du système", available: true }, { label: "Statut providers", prompt: "Quel est l'état des providers ?", available: true }] },
  { domain: "Dev Runtime", icon: "terminal", available: false, actions: [{ label: "Audit repo", prompt: "/runtime audit", available: false }, { label: "Valider build", prompt: "/runtime validate", available: false }] },
] as const;

type TamsCanDoAction = { label: string; prompt: string; available: boolean };
type TamsCanDoDomain = { domain: string; icon: string; available: boolean; actions: readonly TamsCanDoAction[] };

const SLASH_COMMANDS = [
  { command: "/tâche", label: "Créer une tâche", icon: CheckCircle2, color: "text-emerald-400", example: "/tâche Appeler le client demain à 14h" },
  { command: "/projet", label: "Créer un projet", icon: FolderOpen, color: "text-blue-400", example: "/projet Refonte du site web" },
  { command: "/contact", label: "Ajouter un contact", icon: UserPlus, color: "text-violet-400", example: "/contact Jean Dupont, Acme Corp, jean@acme.com" },
  { command: "/studio", label: "Générer dans Studio", icon: Palette, color: "text-pink-400", example: "/studio image un portrait cyberpunk" },
  { command: "/décision", label: "Analyser une décision", icon: Lightbulb, color: "text-amber-400", example: "/décision Dois-je changer de fournisseur ?" },
];

interface ToolCall { name: string; result: string; status?: "pending" | "done" | "error"; args?: Record<string, unknown>; step?: string; error?: string; }

function getToolMeta(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("task") || lower.includes("tâche")) return { icon: CheckCircle2, label: "Tâche créée", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", link: "/travail", actionLabel: "Création de tâche..." };
  if (lower.includes("project") || lower.includes("projet")) return { icon: FolderOpen, label: "Projet créé", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", link: "/travail", actionLabel: "Création de projet..." };
  if (lower.includes("contact") || lower.includes("person")) return { icon: UserPlus, label: "Contact ajouté", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", link: "/contacts", actionLabel: "Ajout du contact..." };
  if (lower.includes("memory") || lower.includes("mémoire")) return { icon: MessageSquare, label: "Mémoire enregistrée", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", link: "/systeme", actionLabel: "Enregistrement mémoire..." };
  if (lower.includes("decision") || lower.includes("décision")) return { icon: Lightbulb, label: "Décision analysée", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", link: "/systeme", actionLabel: "Création d'une décision..." };
  if (lower.includes("image") || lower.includes("studio")) return { icon: Image, label: "Asset Studio créé", color: "bg-pink-500/10 text-pink-400 border-pink-500/20", link: "/studio", actionLabel: "Génération Studio..." };
  if (lower.includes("briefing")) return { icon: BarChart3, label: "Briefing du jour", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", link: "/systeme", actionLabel: "Récupération du briefing..." };
  if (lower.includes("update_task_status")) return { icon: ListChecks, label: "Statut mis à jour", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", link: "/travail", actionLabel: "Mise à jour du statut..." };
  if (lower.includes("project_contact")) return { icon: UserPlus, label: "Contact lié au projet", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", link: "/travail", actionLabel: "Liaison contact-projet..." };
  if (lower.includes("reminder") || lower.includes("rappel")) return { icon: BrainCircuit, label: "Rappel programmé", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", link: undefined, actionLabel: "Programmation du rappel..." };
  return { icon: Zap, label: "Action effectuée", color: "bg-primary/10 text-primary border-primary/20", link: undefined, actionLabel: "Exécution..." };
}

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isHovered, setIsHovered] = useState(false);
  const meta = getToolMeta(tool.name);
  const isPending = tool.status === "pending";
  const isDone = tool.status === "done";
  const isError = tool.status === "error";
  const handleClick = useCallback(() => {
    if (meta.link && !isError) navigate(meta.link);
    else if (isError) toast({ title: "Erreur outil", description: tool.error ?? "Erreur inconnue", variant: "destructive" });
  }, [meta.link, isError, navigate, toast, tool.error]);
  return (
    <div className="w-full mt-2">
      <button onClick={handleClick} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} disabled={isError}
        className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-300 hover-lift", meta.color, meta.link && !isError && "hover:shadow-sm cursor-pointer", isHovered && meta.link && !isError && "scale-[1.01]", isPending && "animate-pulse", isError && "border-red-500/30 bg-red-500/5 cursor-default")}>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500", isDone ? "bg-emerald-500/20" : isError ? "bg-red-500/20" : "bg-current/10")}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isDone ? <Check className="w-4 h-4 text-emerald-400" /> : isError ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <meta.icon className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate">{isPending ? meta.actionLabel : isDone ? meta.label : isError ? "Erreur" : meta.label}</span>
            {isDone && meta.link && <ArrowRight className="w-3 h-3 opacity-60 shrink-0" />}
          </div>
          <p className="text-[10px] opacity-60 truncate font-mono">{tool.name}</p>
        </div>
      </button>
    </div>
  );
}

function QuickActions({ onAction }: { onAction: (text: string) => void }) {
  const actions = [
    { icon: Lightbulb, label: "Décision", prompt: "Aide-moi à décider : ", color: "text-amber-400" },
    { icon: CheckCircle2, label: "Tâche", prompt: "/tâche ", color: "text-emerald-400" },
    { icon: Shield, label: "Red Team", prompt: "Qu'est-ce qui peut mal tourner avec ", color: "text-red-400" },
    { icon: BarChart3, label: "Briefing", prompt: "Donne-moi mon briefing du jour", color: "text-blue-400" },
    { icon: Wand2, label: "Résumé", prompt: "Résume la situation actuelle : ", color: "text-violet-400" },
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {actions.map(({ icon: Icon, label, prompt, color }) => (
        <button key={label} onClick={() => onAction(prompt)} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium", "bg-secondary/60 hover:bg-secondary border border-border hover:border-primary/20", "transition-all duration-200 hover:scale-[1.02]", color)}>
          <Icon className="w-3 h-3" />{label}
        </button>
      ))}
    </div>
  );
}

function SlashCommandPicker({ query, onSelect, onClose }: { query: string; onSelect: (cmd: string) => void; onClose: () => void; }) {
  const filtered = SLASH_COMMANDS.filter((c) => c.command.includes(query) || c.label.toLowerCase().includes(query.toLowerCase()));
  if (filtered.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50 animate-fade-in">
      {filtered.map((cmd) => (
        <button key={cmd.command} onClick={() => { onSelect(cmd.command + " "); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left">
          <div className={cn("w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0", cmd.color)}><cmd.icon className="w-3.5 h-3.5" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="text-xs font-semibold font-mono">{cmd.command}</span><span className="text-[10px] text-muted-foreground">{cmd.label}</span></div>
            <p className="text-[10px] text-muted-foreground truncate">{cmd.example}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function DateSeparator({ date }: { date: Date }) {
  const label = isToday(date) ? "Aujourd'hui" : isYesterday(date) ? "Hier" : format(date, "d MMMM yyyy", { locale: fr });
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-secondary">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function ThinkingIndicator({ step }: { step: number }) {
  const s = THINKING_STEPS[step % THINKING_STEPS.length];
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Bot className="w-3.5 h-3.5 text-primary" /></div>
      <div className="flex items-center gap-2 text-muted-foreground"><s.icon className="w-3.5 h-3.5 animate-pulse text-primary/60" /><span className="text-xs animate-pulse">{s.text}</span></div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Bot className="w-3.5 h-3.5 text-primary" /></div>
      <div className="flex items-center gap-1 py-2">{[0, 1, 2].map((i) => (<span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />))}</div>
    </div>
  );
}

function ActionStatusBar({ actions }: { actions: Array<{ label: string; status: "pending" | "done" | "error" }> }) {
  if (actions.length === 0) return null;
  const done = actions.filter((a) => a.status === "done").length;
  const total = actions.length;
  return (
    <div className="mx-4 mt-2 p-2.5 rounded-xl bg-secondary/40 border border-border space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span className="font-medium">Exécution en cours…</span><span>{done}/{total}</span></div>
      <Progress value={(done / total) * 100} className="h-1" />
      <div className="space-y-0.5">{actions.map((a, i) => (<div key={i} className="flex items-center gap-1.5 text-[10px]">{a.status === "done" ? <Check className="w-3 h-3 text-emerald-400" /> : a.status === "error" ? <AlertTriangle className="w-3 h-3 text-red-400" /> : <Loader2 className="w-3 h-3 animate-spin text-primary" />}<span className={a.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}>{a.label}</span></div>))}</div>
    </div>
  );
}

function MemoryBadge({ count, memories, onToggleContext }: { count: number; memories: string[]; onToggleContext: () => void; }) {
  if (count === 0) return null;
  return (
    <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
      <button onClick={onToggleContext} className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors">
        <MemoryStick className="w-3 h-3" /><span>Mémoire : {count} élément{count !== 1 ? "s" : ""}</span>
      </button>
    </TooltipTrigger><TooltipContent side="bottom" className="max-w-xs"><div className="space-y-1"><p className="font-semibold text-[10px] uppercase tracking-wider opacity-70">Mémoires utilisées</p>{memories.map((m, i) => (<p key={i} className="text-[10px] truncate">{m}</p>))}</div></TooltipContent></Tooltip></TooltipProvider>
  );
}

interface MemoryItem { id: string; type: string; content: string; relevance: number; }

function ContextPanel({ isOpen, onClose, memories }: { isOpen: boolean; onClose: () => void; memories: MemoryItem[]; }) {
  const [, navigate] = useLocation();
  if (!isOpen) return null;
  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-20 flex flex-col animate-slide-in shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-violet-400" /><h3 className="text-sm font-semibold">Contexte</h3></div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {memories.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Aucune mémoire utilisée</p>
          : memories.map((mem) => (
            <div key={mem.id} className="p-3 rounded-xl bg-secondary/40 border border-border space-y-1">
              <div className="flex items-center justify-between"><span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{mem.type}</span><span className="text-[9px] text-muted-foreground">{Math.round(mem.relevance * 100)}%</span></div>
              <p className="text-xs text-foreground/80 line-clamp-3">{mem.content}</p>
            </div>
          ))}
      </div>
      <div className="p-4 border-t border-border">
        <button onClick={() => { onClose(); navigate("/systeme"); }} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors">
          <GitBranch className="w-3.5 h-3.5" />Voir dans le graphe
        </button>
      </div>
    </div>
  );
}

function StructuredContent({ content }: { content: string }) {
  const blocks = useMemo(() => { try { return parseContent(content); } catch { return [{ type: "text" as const, content }]; } }, [content]);
  return <div className="space-y-2">{blocks.map((block, i) => (<ContentBlock key={i} block={block} />))}</div>;
}

interface ContentBlockType { type: "text" | "code" | "table" | "quote" | "list" | "heading"; content: string; language?: string; headers?: string[]; rows?: string[][]; items?: string[]; level?: number; }

function parseContent(content: string): ContentBlockType[] {
  const blocks: ContentBlockType[] = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      blocks.push({ type: "code", content: codeLines.join("\n"), language: lang }); i++; continue;
    }
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.slice(2)]; i++;
      while (i < lines.length && lines[i].startsWith("> ")) { quoteLines.push(lines[i].slice(2)); i++; }
      blocks.push({ type: "quote", content: quoteLines.join("\n") }); continue;
    }
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|-")) {
      const headers = line.split("|").map(h => h.trim()).filter(Boolean); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) { const row = lines[i].split("|").map(c => c.trim()).filter(Boolean); if (row.length > 0) rows.push(row); i++; }
      blocks.push({ type: "table", content: "", headers, rows }); continue;
    }
    if (line.match(/^#{1,3}\s/)) { const level = line.match(/^(#+)/)?.[0].length ?? 1; blocks.push({ type: "heading", content: line.replace(/^#{1,3}\s/, ""), level }); i++; continue; }
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) { items.push(lines[i].replace(/^[-*\d.\s]+/, "")); i++; }
      blocks.push({ type: "list", content: "", items }); continue;
    }
    if (line.trim()) {
      const textLines: string[] = [line]; i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !lines[i].startsWith("> ") && !lines[i].match(/^[-*]\s/) && !lines[i].match(/^\d+\.\s/)) { textLines.push(lines[i]); i++; }
      blocks.push({ type: "text", content: textLines.join("\n") }); continue;
    }
    i++;
  }
  return blocks;
}

function highlightCode(code: string, language?: string): React.ReactNode {
  const keywords = ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "from", "export", "default", "class", "extends", "async", "await", "try", "catch", "new", "this", "typeof"];
  let highlighted = code;
  highlighted = highlighted.replace(/\/\/.*$/gm, match => `§COMMENT§${match}§END§`);
  highlighted = highlighted.replace(/"([^"]*)"|'([^']*)'|`([^`]*)`/g, match => `§STRING§${match}§END§`);
  highlighted = highlighted.replace(/\b\d+\.?\d*\b/g, match => `§NUMBER§${match}§END§`);
  keywords.forEach(kw => { highlighted = highlighted.replace(new RegExp(`\\b${kw}\\b`, "g"), match => `§KEYWORD§${match}§END§`); });
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
          <pre className="px-3 py-2 overflow-x-auto text-xs font-mono leading-relaxed"><code>{highlightCode(block.content, block.language)}</code></pre>
        </div>
      );
    case "table":
      return (<div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse"><thead><tr className="border-b border-border">{block.headers?.map((h, j) => (<th key={j} className="text-left px-2 py-1.5 text-muted-foreground font-semibold">{h}</th>))}</tr></thead><tbody>{block.rows?.map((row, ri) => (<tr key={ri} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">{row.map((cell, ci) => (<td key={ci} className="px-2 py-1.5">{cell}</td>))}</tr>))}</tbody></table></div>);
    case "quote":
      return <blockquote className="border-l-2 border-violet-400/60 pl-3 py-1 my-2 text-sm text-foreground/80 italic bg-violet-500/5 rounded-r-lg">{block.content}</blockquote>;
    case "heading":
      const Tag = `h${Math.min(block.level ?? 1, 3)}` as keyof React.JSX.IntrinsicElements;
      return <Tag className={cn("font-semibold text-foreground mt-3 mb-1", block.level === 1 && "text-base", block.level === 2 && "text-sm", block.level === 3 && "text-xs")}>{block.content}</Tag>;
    case "list":
      return <ul className="space-y-1 my-1">{block.items?.map((item, li) => (<li key={li} className="flex items-start gap-2 text-sm"><span className="w-1 h-1 rounded-full bg-primary/60 mt-2 shrink-0" /><span>{item}</span></li>))}</ul>;
    default:
      return <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{block.content}</p>;
  }
}

function extractSection(content: string, keywords: string[]): string[] {
  const lines = content.split("\n");
  const results: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeader = keywords.some(k => lower.includes(k)) && (line.match(/^#{1,3}\s/) || line.match(/^[-*]\s/) || line.match(/^\d+\.\s/));
    if (isHeader) {
      inSection = true;
      const cleaned = line.replace(/^#{1,3}\s|^[-*\d.\s]+/, "").trim();
      if (cleaned) results.push(cleaned);
    } else if (inSection && line.trim() && !line.match(/^#{1,3}\s/)) {
      if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) { const cleaned = line.replace(/^[-*\d.\s]+/, "").trim(); if (cleaned) results.push(cleaned); }
      else { inSection = false; }
    } else if (line.match(/^#{1,3}\s/)) { inSection = false; }
  }
  if (results.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (keywords.some(k => lines[i].toLowerCase().includes(k))) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (lines[j].match(/^[-*]\s/)) results.push(lines[j].replace(/^[-*\s]+/, "").trim());
        }
      }
    }
  }
  return results;
}

function ChiefOfStaffWidget({ content }: { content: string }) {
  const priorities = extractSection(content, ["priorité", "priorities", "important"]);
  const risks = extractSection(content, ["risque", "risks", "danger"]);
  const actions = extractSection(content, ["action", "tâche", "task", "à faire"]);
  return (
    <div className="mt-3 space-y-2">
      {(priorities.length > 0 || risks.length > 0 || actions.length > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {priorities.length > 0 && (<div className="p-2.5 rounded-xl bg-violet-500/5 border border-violet-500/10"><div className="flex items-center gap-1.5 mb-1.5"><Target className="w-3 h-3 text-violet-400" /><span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Priorités</span></div><ul className="space-y-1">{priorities.slice(0, 3).map((p, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><ChevronRight className="w-2.5 h-2.5 text-violet-400 mt-0.5 shrink-0" /><span className="line-clamp-2">{p}</span></li>))}</ul></div>)}
          {risks.length > 0 && (<div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10"><div className="flex items-center gap-1.5 mb-1.5"><AlertTriangle className="w-3 h-3 text-red-400" /><span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Risques</span></div><ul className="space-y-1">{risks.slice(0, 3).map((r, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><ChevronRight className="w-2.5 h-2.5 text-red-400 mt-0.5 shrink-0" /><span className="line-clamp-2">{r}</span></li>))}</ul></div>)}
          {actions.length > 0 && (<div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10"><div className="flex items-center gap-1.5 mb-1.5"><ListChecks className="w-3 h-3 text-emerald-400" /><span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Actions</span></div><ul className="space-y-1">{actions.slice(0, 3).map((a, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><ChevronRight className="w-2.5 h-2.5 text-emerald-400 mt-0.5 shrink-0" /><span className="line-clamp-2">{a}</span></li>))}</ul></div>)}
        </div>
      ) : null}
    </div>
  );
}

function DecisionWidget({ content }: { content: string }) {
  const pros = extractSection(content, ["pour", "pros", "avantage", "bénéfice", "positif"]);
  const cons = extractSection(content, ["contre", "cons", "inconvénient", "risque", "négatif"]);
  return (
    <div className="mt-3 space-y-2">
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {pros.length > 0 && (<div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10"><div className="flex items-center gap-1.5 mb-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Pour</span></div><ul className="space-y-1">{pros.slice(0, 4).map((p, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><span className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-2 h-2 text-emerald-400" /></span><span className="line-clamp-2">{p}</span></li>))}</ul></div>)}
          {cons.length > 0 && (<div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10"><div className="flex items-center gap-1.5 mb-1.5"><X className="w-3 h-3 text-red-400" /><span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Contre</span></div><ul className="space-y-1">{cons.slice(0, 4).map((c, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><span className="w-3.5 h-3.5 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5"><X className="w-2 h-2 text-red-400" /></span><span className="line-clamp-2">{c}</span></li>))}</ul></div>)}
        </div>
      )}
    </div>
  );
}

function RedTeamWidget({ content }: { content: string }) {
  const challenges = extractSection(content, ["challenge", "problème", "risque", "faille", "weakness"]);
  const mitigations = extractSection(content, ["mitigation", "solution", "contre-mesure", "alternative"]);
  return (
    <div className="mt-3 space-y-2">
      {challenges.length > 0 && (<div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/10"><div className="flex items-center gap-1.5 mb-1.5"><Shield className="w-3 h-3 text-red-400" /><span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Points de vigilance</span></div><ul className="space-y-1">{challenges.slice(0, 4).map((c, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><AlertTriangle className="w-2.5 h-2.5 text-red-400 mt-0.5 shrink-0" /><span className="line-clamp-2">{c}</span></li>))}</ul></div>)}
      {mitigations.length > 0 && (<div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10"><div className="flex items-center gap-1.5 mb-1.5"><Check className="w-3 h-3 text-emerald-400" /><span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Recommandations</span></div><ul className="space-y-1">{mitigations.slice(0, 4).map((m, i) => (<li key={i} className="text-[10px] text-foreground/80 flex items-start gap-1"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 mt-0.5 shrink-0" /><span className="line-clamp-2">{m}</span></li>))}</ul></div>)}
    </div>
  );
}

function ExecutionWidget({ content }: { content: string }) {
  const tasks = extractSection(content, ["tâche", "task", "créé", "ajouté", "action"]);
  return (
    <div className="mt-3">
      {tasks.length > 0 && (
        <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
          <div className="flex items-center gap-1.5 mb-2"><ListChecks className="w-3 h-3 text-emerald-400" /><span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Tâches créées</span></div>
          <div className="space-y-1.5">{tasks.slice(0, 5).map((t, i) => (<div key={i} className="flex items-center gap-2 text-[10px] text-foreground/80 bg-emerald-500/5 rounded-lg px-2 py-1.5"><span className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-[8px] font-bold text-emerald-400">{i + 1}</span><span className="line-clamp-1">{t}</span><Check className="w-2.5 h-2.5 text-emerald-400 ml-auto shrink-0" /></div>))}</div>
        </div>
      )}
    </div>
  );
}

function ModeWidget({ mode, content }: { mode: Mode; content: string }) {
  switch (mode) {
    case "chief_of_staff": return <ChiefOfStaffWidget content={content} />;
    case "decision": return <DecisionWidget content={content} />;
    case "red_team": return <RedTeamWidget content={content} />;
    case "execution": return <ExecutionWidget content={content} />;
    default: return null;
  }
}

function MessageBubble({ msg, mode, onQuickAction }: { msg: Message; mode: Mode; onQuickAction: (text: string) => void; }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2 animate-slide-up", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="relative shrink-0">
          <Avatar className="w-7 h-7 mt-1 ring-2 ring-primary/20 animate-pulse-soft">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[10px]"><Bot className="w-3.5 h-3.5" /></AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background" />
        </div>
      )}
      <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm relative overflow-hidden transition-all duration-300 hover:shadow-md", isUser ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-sm shadow-lg shadow-primary/10" : "bg-gradient-to-br from-secondary to-secondary/80 text-foreground rounded-bl-sm border border-border/50 shadow-sm hover:border-border/80")}>
        {!isUser && <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30 pointer-events-none rounded-2xl rounded-bl-sm", modeGradient[mode] ?? modeGradient.chat)} />}
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1">
            {isUser ? <User className="w-3 h-3 opacity-60" /> : <span className="text-[10px] font-semibold text-primary/70">TAMS AI</span>}
          </div>
          <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}><StructuredContent content={msg.content} /></div>
          <div className={cn("text-[10px] mt-1 text-right", isUser ? "text-primary-foreground/60" : "text-muted-foreground")}>{formatTime(msg.createdAt)}</div>
          {!isUser && (<><ModeWidget mode={mode} content={msg.content} /><QuickActions onAction={onQuickAction} /></>)}
        </div>
      </div>
      {isUser && (<Avatar className="w-7 h-7 mt-1 shrink-0"><AvatarFallback className="bg-primary text-primary-foreground text-[10px]"><User className="w-3.5 h-3.5" /></AvatarFallback></Avatar>)}
    </div>
  );
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() { return <div>Loading...</div>; }
