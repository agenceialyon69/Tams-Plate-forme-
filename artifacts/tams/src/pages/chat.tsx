import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListConversations, useCreateConversation,
  useDeleteConversation, useListMessages,
  getListConversationsQueryKey, getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Send, Trash2, MessageSquare, ChevronLeft, Zap, Square,
  CheckCircle2, FolderOpen, UserPlus, Palette, Lightbulb, Shield,
  ArrowRight, Command, X, Wand2, Image, Film, Music, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

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
}

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  function getToolMeta(name: string) {
    const lower = name.toLowerCase();
    if (lower.includes("task") || lower.includes("tâche")) return { icon: CheckCircle2, label: "Tâche créée", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", link: "/travail" };
    if (lower.includes("project") || lower.includes("projet")) return { icon: FolderOpen, label: "Projet créé", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", link: "/travail" };
    if (lower.includes("contact")) return { icon: UserPlus, label: "Contact ajouté", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", link: "/travail" };
    if (lower.includes("memory") || lower.includes("mémoire")) return { icon: MessageSquare, label: "Mémoire enregistrée", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", link: "/systeme" };
    if (lower.includes("decision") || lower.includes("décision")) return { icon: Lightbulb, label: "Décision analysée", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", link: "/systeme" };
    if (lower.includes("image") || lower.includes("studio")) return { icon: Image, label: "Asset Studio créé", color: "bg-pink-500/10 text-pink-400 border-pink-500/20", link: "/studio" };
    return { icon: Zap, label: "Action effectuée", color: "bg-primary/10 text-primary border-primary/20", link: undefined };
  }

  const meta = getToolMeta(tool.name);

  function handleClick() {
    if (meta.link) {
      navigate(meta.link);
      toast({ title: `Ouverture : ${meta.label}` });
    }
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full mt-2 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all hover:shadow-sm",
        meta.color,
        meta.link && "hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
      )}
    >
      <meta.icon className="w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">{meta.label}</div>
        <div className="text-[10px] opacity-80 truncate">{tool.result}</div>
      </div>
      {meta.link && <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-60" />}
    </button>
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

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: convLoading } = useListConversations();
  const { data: messages = [], isLoading: msgsLoading } = useListMessages(selectedId!, {
    query: { enabled: !!selectedId } as any,
  });

  const createConv = useCreateConversation({
    mutation: {
      onSuccess: conv => {
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, pendingUser, toolCalls]);

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

  const streamMessage = useCallback(async (content: string) => {
    if (!selectedId || !content.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamingContent("");
    setToolCalls([]);
    setPendingUser(content);
    setShowSlashPicker(false);

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
            } else if (event.type === "tool") {
              setToolCalls(prev => [...prev, { name: event.name, result: event.result }]);
            } else if (event.type === "done") {
              doneReceived = true;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
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

  const selectedConv = conversations.find(c => c.id === selectedId);

  return (
    <div className="flex flex-1 overflow-hidden">
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
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Nouvelle conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
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
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Aucune conversation</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => { setSelectedId(conv.id); setShowConvList(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                    selectedId === conv.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
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
                <div className={cn("text-[10px] font-medium", modeColor[selectedConv.mode as Mode] ?? modeColor.chat)}>
                  {MODES.find(m => m.value === selectedConv.mode)?.label}
                </div>
              </div>
              <button
                onClick={() => { if (confirm("Supprimer cette conversation ?")) deleteConv.mutate({ id: selectedConv.id }); }}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Supprimer la conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Sélectionner une conversation</div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">Sélectionne ou crée une conversation</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Tape / pour voir les commandes</p>
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
              {messages.map(msg => (
                <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  )}>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    <div className={cn(
                      "text-[10px] mt-1 text-right",
                      msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      {formatTime(msg.createdAt)}
                    </div>
                    {msg.role === "assistant" && (
                      <QuickActions mode={selectedConv?.mode as Mode ?? "chat"} onAction={handleQuickAction} />
                    )}
                  </div>
                </div>
              ))}

              {/* Optimistic user bubble */}
              {pendingUser && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm bg-primary text-primary-foreground">
                    <div className="whitespace-pre-wrap break-words">{pendingUser}</div>
                  </div>
                </div>
              )}

              {/* Streaming assistant bubble */}
              {isStreaming && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] bg-secondary rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-foreground">
                    {streamingContent ? (
                      <div className="whitespace-pre-wrap break-words">{streamingContent}
                        <span className="inline-block w-0.5 h-3.5 bg-foreground/50 ml-0.5 animate-pulse align-middle" />
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center py-0.5">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </div>
                    )}
                    {toolCalls.map((tool, i) => (
                      <ToolCallCard key={i} tool={tool} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        {selectedId && (
          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border bg-sidebar">
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
                    className="w-full bg-secondary rounded-xl px-3.5 py-2.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[40px] max-h-32"
                    placeholder={isStreaming ? "En cours..." : "Envoyer un message... (tape / pour les commandes)"}
                    value={message}
                    onChange={e => {
                      setMessage(e.target.value);
                      const el = e.target;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  {message.startsWith("/") && (
                    <Command className="absolute right-2.5 top-3 w-3.5 h-3.5 text-muted-foreground/50" />
                  )}
                </div>
                {isStreaming ? (
                  <button
                    onClick={handleStop}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-secondary text-foreground border border-border transition-all hover:bg-accent active:scale-95"
                    title="Arrêter la génération"
                    aria-label="Arrêter la génération"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!message.trim()}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-all hover:bg-primary/90 active:scale-95"
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
    </div>
  );
}
