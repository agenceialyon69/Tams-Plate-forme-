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
  { value: "business_analyst", label: "Analyste Métier", icon: BarChart3 },
  { value: "data_scientist", label: "Data Scientist", icon: Database },
];

const PANELS = {
  STANDARD: "standard",
  TAMS_CAN_DO: "tams_can_do",
  WORKFLOW_ACTIONS: "workflow_actions",
};

const TAMS_CAN_DO_ITEMS = [
  {
    id: "internal_documents",
    label: "Accès aux documents internes",
    icon: FolderOpen,
    description: "Récupérer et traiter des documents",
  },
  {
    id: "write_emails",
    label: "Rédiger des emails",
    icon: FileText,
    description: "Composer et envoyer des emails",
  },
  {
    id: "create_presentations",
    label: "Créer des présentations",
    icon: Film,
    description: "Générer du contenu de présentation",
  },
  {
    id: "task_management",
    label: "Gestion des tâches",
    icon: ListChecks,
    description: "Créer et gérer des tâches",
  },
  {
    id: "web_search",
    label: "Recherche Web",
    icon: Search,
    description: "Effectuer des recherches sur internet",
  },
  {
    id: "database_queries",
    label: "Requêtes Base de données",
    icon: Database,
    description: "Interroger les bases de données",
  },
];

const WORKFLOW_ACTIONS = [
  {
    id: "analyze_market",
    label: "Analyser le marché",
    category: "Analysis",
    icon: BarChart3,
  },
  {
    id: "competitive_analysis",
    label: "Analyse concurrentielle",
    category: "Analysis",
    icon: Target,
  },
  {
    id: "financial_forecast",
    label: "Prévisions financières",
    category: "Finance",
    icon: BarChart3,
  },
  {
    id: "risk_assessment",
    label: "Évaluation des risques",
    category: "Finance",
    icon: AlertTriangle,
  },
  {
    id: "resource_planning",
    label: "Planification des ressources",
    category: "Operations",
    icon: Layers,
  },
  {
    id: "timeline_creation",
    label: "Créer une chronologie",
    category: "Operations",
    icon: GitBranch,
  },
];

interface ChatMessage {
  id: string;
  conversationId: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
  intent?: string;
  routeIntent?: string;
}

interface MatchedCommand {
  command: string;
  intent: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

interface RuntimeTask {
  taskId: string;
  command: string;
  status: "pending" | "running" | "completed" | "failed";
}

export default function ChatPage() {
  const [mode, setMode] = useState("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showTamsPanel, setShowTamsPanel] = useState(false);
  const [showWorkflowActions, setShowWorkflowActions] = useState(false);
  const [currentPanel, setCurrentPanel] = useState(PANELS.STANDARD);
  const [panelHistory, setPanelHistory] = useState<string[]>([]);
  const [routeIntentVisible, setRouteIntentVisible] = useState(false);
  const [matchedCommand, setMatchedCommand] = useState<MatchedCommand | null>(null);
  const [runtimeTask, setRuntimeTask] = useState<RuntimeTask | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [retryCount, setRetryCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: conversations, isLoading: isLoadingConversations } = useListConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const { data: messagesData } = useListMessages(selectedConversation?.id || "");

  // Update messages when messagesData changes
  useEffect(() => {
    if (messagesData) {
      setMessages(messagesData);
    }
  }, [messagesData]);

  const handleNewConversation = useCallback(async () => {
    try {
      const newConversation = await createConversation.mutateAsync({
        title: `Chat - ${new Date().toLocaleString("fr-FR")}`,
      });
      setSelectedConversation(newConversation);
      setMessages([]);
      setInput("");
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer une nouvelle conversation",
        variant: "destructive",
      });
    }
  }, [createConversation, toast]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversation.mutateAsync(conversationId);
        queryClient.invalidateQueries({
          queryKey: getListConversationsQueryKey(),
        });
        if (selectedConversation?.id === conversationId) {
          setSelectedConversation(null);
          setMessages([]);
        }
        setDeleteConfirm(null);
        toast({
          title: "Conversation supprimée",
          description: "La conversation a été supprimée avec succès",
        });
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Impossible de supprimer la conversation",
          variant: "destructive",
        });
      }
    },
    [deleteConversation, selectedConversation, queryClient, toast]
  );

  const processMessage = useCallback(async (content: string) => {
    if (!selectedConversation) {
      await handleNewConversation();
      return;
    }

    setIsLoading(true);
    setRetryCount(0);

    try {
      const token = await getRuntimeAccessToken();
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        conversationId: selectedConversation.id,
        content: content,
        role: "user",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Try to match runtime command
      try {
        const matched = await matchRuntimeCommand({
          command: content,
          token: token || undefined,
        });
        setMatchedCommand(matched);
        setRouteIntentVisible(true);

        // If we have a matched command, trigger the runtime task
        if (matched) {
          const task = await requestRuntimeTask({
            command: matched.command,
            intent: matched.intent,
            parameters: matched.parameters,
            token: token || undefined,
          });
          setRuntimeTask(task);
        }
      } catch (error) {
        if (error instanceof RuntimeBridgeError) {
          console.error("Runtime bridge error:", error.message);
        }
      }

      // Get response from API
      const response = await fetch(`${API_BASE}/api/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          content: content,
          mode: mode,
          matchedCommand: matchedCommand,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        conversationId: selectedConversation.id,
        content: data.message || "Je n'ai pas pu générer de réponse",
        role: "assistant",
        createdAt: new Date().toISOString(),
        intent: data.intent,
        routeIntent: data.routeIntent,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setRouteIntentVisible(false);
      setMatchedCommand(null);
    } catch (error) {
      console.error("Error processing message:", error);
      const retryAttempt = retryCount + 1;
      
      if (retryAttempt < 3 && isOnline) {
        setRetryCount(retryAttempt);
        setTimeout(() => processMessage(content), 1000 * retryAttempt);
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de traiter votre message",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedConversation, mode, matchedCommand, handleNewConversation, toast, isOnline, retryCount]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim()) return;

    const message = input;
    setInput("");
    await processMessage(message);
  }, [input, processMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Online/Offline handling
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const groupedConversations = useMemo(() => {
    if (!conversations) return {};

    const groups: Record<string, Conversation[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    conversations.forEach((conv) => {
      const convDate = new Date(conv.createdAt);
      if (isToday(convDate)) {
        groups.today.push(conv);
      } else if (isYesterday(convDate)) {
        groups.yesterday.push(conv);
      } else if (convDate.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000) {
        groups.thisWeek.push(conv);
      } else {
        groups.older.push(conv);
      }
    });

    return groups;
  }, [conversations]);

  const renderConversationGroup = (
    title: string,
    convs: Conversation[]
  ) => (
    <div key={title} className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide">
        {title}
      </div>
      {convs.map((conv) => (
        <div key={conv.id} className="group relative px-2">
          <button
            onClick={() => setSelectedConversation(conv)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg transition-colors",
              selectedConversation?.id === conv.id
                ? "bg-blue-100 text-blue-900"
                : "hover:bg-gray-100"
            )}
          >
            <div className="flex items-start gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{conv.title}</p>
                <p className="text-xs text-gray-500">
                  {format(new Date(conv.createdAt), "HH:mm", { locale: fr })}
                </p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setDeleteConfirm(conv.id)}
            className="absolute right-2 top-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
          </button>
        </div>
      ))}
    </div>
  );

  const tamsCanDoSection = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-3">
        <h3 className="text-sm font-semibold text-gray-700">Capacités TAMS</h3>
        <button
          onClick={() => setCurrentPanel(PANELS.STANDARD)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ← Retour
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 px-3">
        {TAMS_CAN_DO_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <TooltipProvider key={item.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setInput(`Peux-tu ${item.label.toLowerCase()}?`);
                      setCurrentPanel(PANELS.STANDARD);
                    }}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-blue-50 transition-colors text-left"
                  >
                    <Icon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-600">{item.description}</p>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {item.description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );

  const workflowActionsSection = () => {
    const categories = Array.from(
      new Set(WORKFLOW_ACTIONS.map((a) => a.category))
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-3">
          <h3 className="text-sm font-semibold text-gray-700">Actions Workflow</h3>
          <button
            onClick={() => setCurrentPanel(PANELS.STANDARD)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            ← Retour
          </button>
        </div>
        <div className="space-y-3 px-3">
          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">
                {category}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {WORKFLOW_ACTIONS.filter((a) => a.category === category).map(
                  (action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => {
                          setInput(`Execute ${action.label}`);
                          setCurrentPanel(PANELS.STANDARD);
                        }}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-orange-50 transition-colors text-left"
                      >
                        <Icon className="w-4 h-4 text-orange-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-gray-900">
                          {action.label}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSidebar = () => (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={handleNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoadingConversations ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : conversations && conversations.length > 0 ? (
          <div className="space-y-4 p-4">
            {Object.entries(groupedConversations).map(([group, convs]) =>
              convs.length > 0 ? renderConversationGroup(group, convs) : null
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Aucune conversation
          </div>
        )}
      </div>
    </div>
  );

  const renderMainPanel = () => {
    if (currentPanel === PANELS.TAMS_CAN_DO) {
      return tamsCanDoSection();
    }

    if (currentPanel === PANELS.WORKFLOW_ACTIONS) {
      return workflowActionsSection();
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <TooltipProvider key={m.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setMode(m.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                        mode === m.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {m.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Mode: {m.label}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setPanelHistory([...panelHistory, currentPanel]);
              setCurrentPanel(PANELS.TAMS_CAN_DO);
            }}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors text-sm font-medium text-blue-700"
          >
            <CheckCircle2 className="w-4 h-4" />
            TAMS Can Do
          </button>

          <button
            onClick={() => {
              setPanelHistory([...panelHistory, currentPanel]);
              setCurrentPanel(PANELS.WORKFLOW_ACTIONS);
            }}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors text-sm font-medium text-orange-700"
          >
            <Wand2 className="w-4 h-4" />
            Actions Workflow
          </button>
        </div>

        {matchedCommand && routeIntentVisible && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-900">Intent Détecté</p>
                <p className="text-xs text-green-700 mt-1">
                  <strong>Commande:</strong> {matchedCommand.command}
                </p>
                <p className="text-xs text-green-700">
                  <strong>Intent:</strong> {matchedCommand.intent}
                </p>
                <p className="text-xs text-green-700">
                  <strong>Confiance:</strong> {(matchedCommand.confidence * 100).toFixed(0)}%
                </p>
                {runtimeTask && (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <p className="text-xs text-green-700">
                      <strong>Tâche Runtime:</strong> {runtimeTask.taskId}
                    </p>
                    <p className="text-xs text-green-700">
                      <strong>Statut:</strong> {runtimeTask.status}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 px-1">Suggestions Rapides</p>
          <div className="grid grid-cols-1 gap-2">
            {[
              "Analyse de marché",
              "Rédiger un email",
              "Créer une présentation",
              "Recherche produits",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="text-left px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-sm text-gray-700"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 gap-4 p-4">
      {/* Sidebar */}
      {isSidebarOpen && (
        <div className="w-64 rounded-lg shadow-sm bg-white flex flex-col">
          {renderSidebar()}
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-white shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {isSidebarOpen ? (
                <ChevronLeft className="w-5 h-5" />
              ) : (
                <MessageSquare className="w-5 h-5" />
              )}
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">TAMS Chat</h1>
              <p className="text-xs text-gray-500">
                {selectedConversation ? selectedConversation.title : "Pas de conversation"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-50 border border-red-200">
                      <WifiOff className="w-4 h-4 text-red-600" />
                      <span className="text-xs font-medium text-red-600">Hors ligne</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Vous êtes actuellement hors ligne
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setShowModelSelector(!showModelSelector);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium text-gray-700"
                  >
                    <Brain className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Sélectionner un modèle
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate("/")}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Tableau de bord
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Messages Area */}
          <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm">
            {selectedConversation ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center space-y-3">
                        <div className="flex justify-center">
                          <Brain className="w-12 h-12 text-gray-300" />
                        </div>
                        <p className="text-gray-500 text-sm">Aucun message. Commencez une conversation!</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <div key={message.id} className={cn(
                          "flex gap-3",
                          message.role === "user" ? "justify-end" : "justify-start"
                        )}>
                          {message.role === "assistant" && (
                            <Avatar className="w-8 h-8 bg-blue-600 flex-shrink-0">
                              <AvatarFallback className="text-white text-xs">AI</AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn(
                            "max-w-xs lg:max-w-md px-4 py-2 rounded-lg",
                            message.role === "user"
                              ? "bg-blue-600 text-white rounded-br-none"
                              : "bg-gray-100 text-gray-900 rounded-bl-none"
                          )}>
                            <p className="text-sm break-words">{message.content}</p>
                            {message.intent && (
                              <p className="text-xs mt-1 opacity-70">
                                Intent: {message.intent}
                              </p>
                            )}
                            {message.routeIntent && (
                              <p className="text-xs mt-1 opacity-70">
                                Route: {message.routeIntent}
                              </p>
                            )}
                          </div>
                          {message.role === "user" && (
                            <Avatar className="w-8 h-8 bg-gray-300 flex-shrink-0">
                              <AvatarFallback className="text-gray-700 text-xs">U</AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex gap-3 justify-start">
                          <Avatar className="w-8 h-8 bg-blue-600 flex-shrink-0">
                            <AvatarFallback className="text-white text-xs">AI</AvatarFallback>
                          </Avatar>
                          <div className="bg-gray-100 px-4 py-2 rounded-lg rounded-bl-none">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                <div className="border-t border-gray-200 p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Tapez votre message..."
                      className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isLoading || !isOnline}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isLoading || !input.trim() || !isOnline}
                      className={cn(
                        "px-4 py-2 rounded-lg font-medium transition-colors",
                        isLoading || !input.trim() || !isOnline
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      )}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <MessageSquare className="w-12 h-12 text-gray-300" />
                  </div>
                  <p className="text-gray-500 text-sm">Sélectionnez une conversation ou créez-en une nouvelle</p>
                  <button
                    onClick={handleNewConversation}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Nouvelle conversation
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Quick Actions */}
          <div className="w-72 bg-white rounded-lg shadow-sm p-4 overflow-y-auto">
            {renderMainPanel()}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action ne peut pas être annulée. Êtes-vous sûr de vouloir supprimer cette conversation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) {
                  handleDeleteConversation(deleteConfirm);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Model Selector Modal */}
      {showModelSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg">
            <h2 className="text-lg font-bold mb-4">Sélectionner un modèle</h2>
            <div className="space-y-2 mb-6">
              {["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet"].map((model) => (
                <button
                  key={model}
                  onClick={() => {
                    setSelectedModel(model);
                    setShowModelSelector(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 rounded-lg transition-colors",
                    selectedModel === model
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 hover:bg-gray-200"
                  )}
                >
                  {model}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowModelSelector(false)}
              className="w-full px-4 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}