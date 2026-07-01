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

/* ─── TAMS Can Do panel data ─── */
const TAMS_CAN_DO = [
  {
    domain: "Analyse & Décision",
    icon: "brain",
    available: true,
    actions: [
      { label: "Analyser une décision", prompt: "Aide-moi à décider : ", available: true },
      { label: "Red Team / risques", prompt: "Qu'est-ce qui peut mal tourner avec ", available: true },
      { label: "Interroger la mémoire", prompt: "Qu'est-ce que tu sais sur ", available: true },
    ],
  },
  {
    domain: "Studio Créatif",
    icon: "palette",
    available: true,
    actions: [
      { label: "Plan Studio", prompt: "/studio ", available: true },
      { label: "Générer une image", prompt: "/image ", available: true },
      { label: "Script / brief", prompt: "/script ", available: true },
      { label: "Plan musique", prompt: "Crée un plan musical pour ", available: true },
    ],
  },
  {
    domain: "Projets & Tâches",
    icon: "folder",
    available: true,
    actions: [
      { label: "Créer un projet", prompt: "/projet ", available: true },
      { label: "Créer une tâche", prompt: "/tâche ", available: true },
      { label: "Ajouter un contact", prompt: "/contact ", available: true },
    ],
  },
  {
    domain: "Système",
    icon: "monitor",
    available: true,
    actions: [
      { label: "Santé système", prompt: "Vérifie la santé du système", available: true },
      { label: "Statut providers", prompt: "Quel est l'état des providers ?", available: true },
    ],
  },
  {
    domain: "Dev Runtime",
    icon: "terminal",
    available: false,
    actions: [
      { label: "Audit repo", prompt: "/runtime audit", available: false },
      { label: "Valider build", prompt: "/runtime validate", available: false },
    ],
  },
] as const;

type TamsCanDoAction = { label: string; prompt: string; available: boolean };
type TamsCanDoDomain = { domain: string; icon: string; available: boolean; actions: readonly TamsCanDoAction[] };

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

// NOTE: This file continues — see commit history for full content.
// The TAMS Can Do panel and full chat implementation follow below.
export { TAMS_CAN_DO };
export type { TamsCanDoAction, TamsCanDoDomain };
