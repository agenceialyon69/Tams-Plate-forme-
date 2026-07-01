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
  { value: "orchestrator", label: "Orchestrateur", icon: Wrench },
  { value: "missions", label: "Missions", icon: Target },
];

interface PanelState {
  type: "none" | "runtime-commands" | "mode-info" | "tams-can-do";
  data?: any;
}

export function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<PanelState>({ type: "none" });
  const [runtimeStatus, setRuntimeStatus] = useState<"online" | "offline" | "checking">("checking");
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string>("chat");
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const confirmActionRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const location = useLocation();

  // API Queries
  const { data: conversationsData, isLoading: convLoading } = useListConversations({ pageSize: 100 });
  const { mutate: createConv } = useCreateConversation();
  const { mutate: deleteConv } = useDeleteConversation();
  const { data: messagesData } = useListMessages({
    conversationId: selectedConversation?.id ?? "",
    pageSize: 100,
    enabled: !!selectedConversation?.id,
  });

  // Update conversations list
  useEffect(() => {
    if (conversationsData?.items) {
      setConversations(conversationsData.items);
    }
  }, [conversationsData]);

  // Initialize first conversation
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversation) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation]);

  // Check runtime status
  useEffect(() => {
    const checkRuntime = async () => {
      try {
        const token = await getRuntimeAccessToken();
        if (!token) {
          setRuntimeStatus("offline");
          return;
        }
        
        // Try a simple runtime command to verify connection
        const result = await matchRuntimeCommand("ping");
        setRuntimeStatus(result ? "online" : "offline");
      } catch {
        setRuntimeStatus("offline");
      }
    };

    checkRuntime();
    const interval = setInterval(checkRuntime, 30000);
    return () => clearInterval(interval);
  }, []);

  const createNewConversation = () => {
    createConv(
      { title: `Conversation ${new Date().toLocaleDateString("fr-FR")}` },
      {
        onSuccess: (data) => {
          setConversations((prev) => [data, ...prev]);
          setSelectedConversation(data);
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: (error) => {
          setErrorMessage(`Erreur: ${error.message}`);
          toast({
            title: "Erreur",
            description: "Impossible de créer une conversation",
            variant: "destructive",
          });
        },
      }
    );
  };

  const deleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    confirmActionRef.current = () => {
      deleteConv(convId, {
        onSuccess: () => {
          setConversations((prev) => prev.filter((c) => c.id !== convId));
          if (selectedConversation?.id === convId) {
            setSelectedConversation(conversations[0] || null);
          }
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: (error) => {
          setErrorMessage(`Erreur: ${error.message}`);
        },
      });
    };
    setConfirmOpen(true);
  };

  const sendMessage = useCallback(
    async (e: React.KeyboardEvent<HTMLTextAreaElement> | React.FormEvent<HTMLFormElement>) => {
      if (e instanceof KeyboardEvent) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
      } else {
        e.preventDefault();
      }

      if (!messageText.trim() || !selectedConversation || isLoading) return;

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const token = await getRuntimeAccessToken();
        if (!token) throw new RuntimeBridgeError("No runtime token");

        // Route message to appropriate handler based on mode
        if (selectedMode === "chief_of_staff") {
          // Route to Chief of Staff
          const result = await requestRuntimeTask("chief_of_staff", {
            conversationId: selectedConversation.id,
            message: messageText,
            file: file ? { name: file.name, size: file.size } : undefined,
          });
          
          // Handle result
          if (result.runtimeHint?.kernelRouteIntent) {
            setPanelState({
              type: "runtime-commands",
              data: result.runtimeHint.kernelRouteIntent,
            });
          }
        } else {
          // Standard chat routing
          await requestRuntimeTask("chat", {
            conversationId: selectedConversation.id,
            message: messageText,
          });
        }

        setMessageText("");
        setFile(null);
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ conversationId: selectedConversation.id }) });
      } catch (error) {
        const message = error instanceof RuntimeBridgeError ? error.message : "Erreur d'envoi";
        setErrorMessage(message);
        toast({
          title: "Erreur",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [messageText, selectedConversation, isLoading, selectedMode, file, queryClient, toast]
  );

  const messages = useMemo(() => {
    if (!messagesData?.items) return [];
    return messagesData.items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messagesData]);

  const getConversationDate = (date: string) => {
    const d = new Date(date);
    if (isToday(d)) return "Aujourd'hui";
    if (isYesterday(d)) return "Hier";
    return format(d, "d MMMM yyyy", { locale: fr });
  };

  const formatMessageTime = (date: string) => {
    return format(new Date(date), "HH:mm", { locale: fr });
  };

  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: Conversation[] } = {
      "Aujourd'hui": [],
      "Cette semaine": [],
      "Ce mois-ci": [],
      "Plus ancien": [],
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

    conversations.forEach((conv) => {
      const convDate = new Date(conv.updatedAt);
      const convDateOnly = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

      if (convDateOnly.getTime() === today.getTime()) {
        groups["Aujourd'hui"].push(conv);
      } else if (convDateOnly.getTime() >= weekAgo.getTime()) {
        groups["Cette semaine"].push(conv);
      } else if (convDateOnly.getTime() >= monthAgo.getTime()) {
        groups["Ce mois-ci"].push(conv);
      } else {
        groups["Plus ancien"].push(conv);
      }
    });

    return Object.entries(groups).filter(([, convs]) => convs.length > 0);
  }, [conversations]);

  const TAMSCapabilities = [
    {
      title: "Analyse Stratégique",
      description: "Analyse approfondie des enjeux politiques et stratégiques",
      icon: Brain,
    },
    {
      title: "Rédaction Administrative",
      description: "Rédaction de documents administratifs et officiels",
      icon: FileText,
    },
    {
      title: "Synthèse d'Information",
      description: "Synthèse d'informations complexes et résumés analytiques",
      icon: BarChart3,
    },
    {
      title: "Aide à la Décision",
      description: "Recommandations et aide à la prise de décision",
      icon: Target,
    },
    {
      title: "Suivi Administratif",
      description: "Suivi des dossiers et gestion administrative",
      icon: ListChecks,
    },
    {
      title: "Évaluation de Normes",
      description: "Évaluation de conformité juridique et normative",
      icon: Scale,
    },
  ];

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className="w-64 border-r bg-sidebar flex flex-col">
          {/* Header */}
          <div className="p-4 border-b">
            <button
              onClick={createNewConversation}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Nouvelle conversation
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Chargement...</div>
            ) : groupedConversations.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Aucune conversation</div>
            ) : (
              groupedConversations.map(([groupName, convs]) => (
                <div key={groupName} className="mb-4">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    {groupName}
                  </div>
                  {convs.map((conv) => (
                    <div key={conv.id}>
                      <button
                        onClick={() => {
                          setSelectedConversation(conv);
                          setExpandedConversation(expandedConversation === conv.id ? null : conv.id);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between group",
                          selectedConversation?.id === conv.id && "bg-accent"
                        )}
                      >
                        <div className="flex-1 truncate">
                          <div className="truncate">{conv.title}</div>
                          <div className="text-xs text-muted-foreground">{formatMessageTime(conv.updatedAt)}</div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded"
                          onClick={(e) => deleteConversation(conv.id, e)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="border-b bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedConversation && (
                <>
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <div>
                    <h2 className="font-semibold">{selectedConversation.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {getConversationDate(selectedConversation.createdAt)}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Runtime Status */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      {runtimeStatus === "online" ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : runtimeStatus === "offline" ? (
                        <WifiOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <RotateCcw className="w-4 h-4 text-yellow-500 animate-spin" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {runtimeStatus === "online" ? "Runtime connecté" : runtimeStatus === "offline" ? "Runtime déconnecté" : "Vérification de la connexion..."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Mode Selector */}
              <div className="flex gap-1">
                {MODES.map((mode) => (
                  <Tooltip key={mode.value}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setSelectedMode(mode.value)}
                        className={cn(
                          "p-2 rounded hover:bg-accent transition-colors",
                          selectedMode === mode.value && "bg-primary text-primary-foreground"
                        )}
                      >
                        <mode.icon className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{mode.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Panel Toggle */}
              {selectedMode === "chief_of_staff" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() =>
                        setPanelState(
                          panelState.type === "tams-can-do"
                            ? { type: "none" }
                            : { type: "tams-can-do" }
                        )
                      }
                      className={cn(
                        "p-2 rounded hover:bg-accent transition-colors",
                        panelState.type === "tams-can-do" && "bg-primary text-primary-foreground"
                      )}
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>TAMS - Ce que je peux faire</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Messages Display */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Commencez une conversation</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-3",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {msg.role === "assistant" && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback>IA</AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={cn(
                          "rounded-lg px-4 py-2 max-w-xs lg:max-w-md",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-accent text-accent-foreground"
                        )}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {formatMessageTime(msg.createdAt)}
                        </p>
                      </div>
                      {msg.role === "user" && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback>U</AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback>IA</AvatarFallback>
                    </Avatar>
                    <div className="bg-accent rounded-lg px-4 py-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="px-4 py-2 bg-destructive/10 border border-destructive text-destructive text-sm rounded-lg mx-4 mb-2">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>{errorMessage}</div>
                  </div>
                </div>
              )}

              {/* Input Area */}
              <form onSubmit={sendMessage} className="p-4 border-t space-y-2">
                {file && (
                  <div className="flex items-center gap-2 p-2 bg-accent rounded-lg">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-sm flex-1">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="p-1 hover:bg-background rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        sendMessage(e);
                      }
                    }}
                    placeholder="Écrivez votre message... (Ctrl+Entrée pour envoyer)"
                    className="flex-1 rounded-lg border p-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    rows={3}
                  />
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded hover:bg-accent transition-colors"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <button
                      type="submit"
                      disabled={!messageText.trim() || isLoading}
                      className="p-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Right Panel */}
            {panelState.type !== "none" && (
              <div className="w-80 border-l bg-card p-4 overflow-y-auto">
                {panelState.type === "tams-can-do" && (
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      TAMS - Ce que je peux faire
                    </h3>
                    <div className="space-y-3">
                      {TAMSCapabilities.map((capability, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-start gap-3">
                            <capability.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-sm">{capability.title}</h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {capability.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {panelState.type === "runtime-commands" && panelState.data && (
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <GitBranch className="w-5 h-5" />
                      Route Intent (Kernel)
                    </h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-96">
                      {JSON.stringify(panelState.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. La conversation sera supprimée définitivement.
              </AlertDialogDescription>
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