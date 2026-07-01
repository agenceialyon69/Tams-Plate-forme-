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
      { label: "Générer une vidéo", prompt: "/video ", available: false },
    ],
  },
  {
    domain: "Exécution",
    icon: "zap",
    available: true,
    actions: [
      { label: "Exécuter une tâche", prompt: "/execute ", available: true },
      { label: "Programmer une action", prompt: "/schedule ", available: false },
    ],
  },
  {
    domain: "Données & Analytics",
    icon: "database",
    available: false,
    actions: [
      { label: "Analyser les données", prompt: "/data ", available: false },
      { label: "Générer un rapport", prompt: "/report ", available: false },
    ],
  },
];

type TAMSCanDoItem = typeof TAMS_CAN_DO[number];
type TAMSAction = TAMSCanDoItem['actions'][number];

interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachedImages?: string[];
  isLoading?: boolean;
  error?: string | null;
  timestamp?: Date;
}

interface Conversation {
  id: string;
  title: string;
  mode: Mode;
  createdAt: Date;
  updatedAt: Date;
}

export default function Chat() {
  const [mode, setMode] = useState<Mode>("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isThinking, setIsThinking] = useState(false);
  const [showTamsCandoDo, setShowTamsCandoDo] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input after loading
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_BASE}/conversations`, {
        headers: { "Authorization": `Bearer ${await getRuntimeAccessToken()}` },
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
      setIsConnected(false);
    }
  };

  const createNewConversation = async () => {
    try {
      const response = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await getRuntimeAccessToken()}`,
        },
        body: JSON.stringify({ mode, title: `Chat - ${new Date().toLocaleString()}` }),
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(data.id);
        setMessages([]);
        setSelectedConversation(data);
        await loadConversations();
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
      toast({ title: "Erreur", description: "Impossible de créer la conversation", variant: "destructive" });
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/conversations/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${await getRuntimeAccessToken()}` },
      });
      if (response.ok) {
        setConversations(conversations.filter((c) => c.id !== id));
        if (currentConversationId === id) {
          setCurrentConversationId(null);
          setMessages([]);
        }
        toast({ title: "Conversation supprimée" });
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      toast({ title: "Erreur", description: "Impossible de supprimer la conversation", variant: "destructive" });
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
        headers: { "Authorization": `Bearer ${await getRuntimeAccessToken()}` },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const selectConversation = (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
    setSelectedConversation(conversation);
    loadMessages(conversation.id);
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || !currentConversationId) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: currentConversationId,
      role: "user",
      content: inputValue,
      attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInputValue("");
    setAttachedImages([]);
    setIsLoading(true);
    setIsThinking(true);

    try {
      const token = await getRuntimeAccessToken();
      const response = await fetch(`${API_BASE}/conversations/${currentConversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: inputValue,
          attachedImages: attachedImages,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMessage.id
            ? { ...m, id: data.user_message_id }
            : m
        )
      );

      const assistantMessage: Message = {
        id: data.assistant_message_id,
        conversationId: currentConversationId,
        role: "assistant",
        content: data.content,
        timestamp: new Date(data.timestamp),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le message. Vérifiez votre connexion.",
        variant: "destructive",
      });
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/")).slice(0, 4);
    files.forEach((file) => {
      if (file.size > 6_000_000) {
        toast({ title: "Image trop lourde", description: "Maximum ~6 Mo par image.", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setAttachedImages((prev) => (prev.length < 4 ? [...prev, url] : prev));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSwitchMode = (newMode: Mode) => {
    if (newMode !== mode) {
      setMode(newMode);
      setCurrentConversationId(null);
      setMessages([]);
    }
  };

  const handleTamsActionClick = (action: TAMSAction) => {
    if (action.available && inputRef.current) {
      setInputValue(action.prompt);
      inputRef.current.focus();
    }
  };

  // Format date helper
  const formatMessageDate = (date: Date | undefined) => {
    if (!date) return "";
    const d = new Date(date);
    if (isToday(d)) return format(d, "HH:mm", { locale: fr });
    if (isYesterday(d)) return "Hier " + format(d, "HH:mm", { locale: fr });
    return format(d, "dd MMM", { locale: fr });
  };

  const groupedConversations = useMemo(() => {
    const today = [];
    const week = [];
    const older = [];
    const now = new Date();

    conversations.forEach((conv) => {
      const convDate = new Date(conv.createdAt);
      const daysAgo = Math.floor((now.getTime() - convDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysAgo === 0) today.push(conv);
      else if (daysAgo < 7) week.push(conv);
      else older.push(conv);
    });

    return { today, week, older };
  }, [conversations]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* ─── Sidebar ─── */}
        <div className="w-64 border-r border-slate-700/50 bg-slate-900/50 backdrop-blur-xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <span className="font-semibold text-slate-100">TAMS</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={createNewConversation}
                  className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                  aria-label="New conversation"
                >
                  <Plus className="w-4 h-4 text-slate-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent>New conversation</TooltipContent>
            </Tooltip>
          </div>

          {/* Mode selector */}
          <div className="p-3 space-y-1 border-b border-slate-700/30">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => handleSwitchMode(m.value)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  mode === m.value
                    ? `${modeColor[m.value]} bg-opacity-50 shadow-lg"
                    : "text-slate-400 hover:bg-slate-700/30"
                )}
              >
                <div className="flex items-center gap-2">
                  <m.icon className="w-4 h-4" />
                  {m.label}
                </div>
              </button>
            ))}
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto space-y-3 p-3">
            {groupedConversations.today.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase px-2 mb-2">Today</div>
                {groupedConversations.today.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={cn(
                      "p-2 rounded-lg cursor-pointer transition-all group text-sm",
                      selectedConversation?.id === conv.id
                        ? "bg-slate-700/50 text-slate-100"
                        : "text-slate-400 hover:bg-slate-700/30"
                    )}
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {groupedConversations.week.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase px-2 mb-2">This week</div>
                {groupedConversations.week.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={cn(
                      "p-2 rounded-lg cursor-pointer transition-all group text-sm",
                      selectedConversation?.id === conv.id
                        ? "bg-slate-700/50 text-slate-100"
                        : "text-slate-400 hover:bg-slate-700/30"
                    )}
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {groupedConversations.older.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase px-2 mb-2">Older</div>
                {groupedConversations.older.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={cn(
                      "p-2 rounded-lg cursor-pointer transition-all group text-sm",
                      selectedConversation?.id === conv.id
                        ? "bg-slate-700/50 text-slate-100"
                        : "text-slate-400 hover:bg-slate-700/30"
                    )}
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Main chat area ─── */}
        <div className="flex-1 flex flex-col">
          {!currentConversationId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="max-w-2xl w-full space-y-8 text-center">
                {/* Logo/Title */}
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-slate-100">Welcome to TAMS</h1>
                  <p className="text-slate-400">Your AI Assistant for Smart Decisions & Execution</p>
                </div>

                {/* TAMS Can Do Panel */}
                <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700/30 p-6 space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 justify-center">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                      What can I do for you?
                    </h2>
                    <p className="text-sm text-slate-400">Choose an action to get started</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {TAMS_CAN_DO.map((domain, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/20 rounded-lg">
                          {domain.icon === "brain" && <Brain className="w-4 h-4 text-blue-400" />}
                          {domain.icon === "palette" && <Palette className="w-4 h-4 text-purple-400" />}
                          {domain.icon === "zap" && <Zap className="w-4 h-4 text-amber-400" />}
                          {domain.icon === "database" && <Database className="w-4 h-4 text-emerald-400" />}
                          <span className="text-sm font-medium text-slate-200">{domain.domain}</span>
                          {!domain.available && <span className="text-xs text-slate-500 ml-auto">Coming soon</span>}
                        </div>
                        <div className="space-y-1.5">
                          {domain.actions.map((action, aIdx) => (
                            <button
                              key={aIdx}
                              onClick={() => handleTamsActionClick(action)}
                              disabled={!action.available}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                                action.available
                                  ? "bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 cursor-pointer"
                                  : "bg-slate-800/20 text-slate-600 cursor-not-allowed opacity-50"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {action.available ? <ArrowRight className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                {action.label}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Start new conversation button */}
                <button
                  onClick={createNewConversation}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                >
                  <div className="flex items-center gap-2 justify-center">
                    <MessageSquare className="w-4 h-4" />
                    Start New Conversation
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-slate-400">No messages yet. Start typing to begin the conversation.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn("flex gap-4", msg.role === "user" ? "justify-end" : "justify-start")}
                    >
                      {msg.role === "assistant" && (
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        </Avatar>
                      )}
                      <div
                        className={cn(
                          "max-w-lg rounded-lg px-4 py-2 break-words",
                          msg.role === "user"
                            ? "bg-blue-500/20 text-slate-100 border border-blue-500/30"
                            : "bg-slate-700/30 text-slate-100 border border-slate-600/30"
                        )}
                      >
                        {msg.error && <span className="text-red-400 text-sm">{msg.error}</span>}
                        {msg.content}
                        {msg.attachedImages && msg.attachedImages.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {msg.attachedImages.map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`Attached image ${idx + 1}`}
                                className="max-w-xs rounded"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <div className="w-full h-full bg-slate-600 flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                          </div>
                        </Avatar>
                      )}
                    </div>
                  ))
                )}
                {isThinking && (
                  <div className="flex gap-4 justify-start">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    </Avatar>
                    <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg px-4 py-2 space-y-2">
                      {THINKING_STEPS.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                          <step.icon className="w-4 h-4 text-blue-400 animate-pulse" />
                          {step.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-slate-700/30 bg-slate-900/50 p-4">
                <form onSubmit={handleSendMessage} className="space-y-3">
                  {attachedImages.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {attachedImages.map((img, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={img}
                            alt={`Attached image ${idx + 1}`}
                            className="h-16 w-16 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 hover:bg-red-600 transition-colors"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      aria-label="Attach images"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 text-slate-400 hover:bg-slate-700/30 rounded-lg transition-colors"
                          aria-label="Attach images"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Attach images</TooltipContent>
                    </Tooltip>
                    <input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          handleSendMessage(e as any);
                        }
                      }}
                      placeholder="Type your message here..."
                      className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                      disabled={isLoading}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="submit"
                          disabled={!inputValue.trim() || isLoading}
                          className="p-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                          aria-label="Send message"
                        >
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Send message</TooltipContent>
                    </Tooltip>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>

        {/* ─── Connection status indicator ─── */}
        <div className="fixed bottom-4 right-4 flex items-center gap-2 text-sm text-slate-400">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span>Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-500" />
              <span>Disconnected</span>
            </>
          )}
        </div>

        {/* ─── Delete confirmation dialog ─── */}
        <AlertDialog>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this conversation? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-500 hover:bg-red-600">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}