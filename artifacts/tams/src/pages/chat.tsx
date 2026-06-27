import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListConversations, useCreateConversation,
  useDeleteConversation, useListMessages,
  getListConversationsQueryKey, getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2, MessageSquare, ChevronLeft, Zap, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MODES = [
  { value: "chat",           label: "Conversation" },
  { value: "chief_of_staff", label: "Chef de Cabinet" },
  { value: "decision",       label: "Décision" },
  { value: "red_team",       label: "Red Team" },
  { value: "execution",      label: "Exécution" },
] as const;

type Mode = typeof MODES[number]["value"];

const modeColor: Record<Mode, string> = {
  chat:           "text-blue-400 bg-blue-500/10",
  chief_of_staff: "text-violet-400 bg-violet-500/10",
  decision:       "text-amber-400 bg-amber-500/10",
  red_team:       "text-red-400 bg-red-500/10",
  execution:      "text-emerald-400 bg-emerald-500/10",
};

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Resolve API base URL from env (Vite exposes VITE_* vars)
const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

export default function Chat() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showConvList, setShowConvList] = useState(true);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [newTitle, setNewTitle] = useState("");
  const [showNew, setShowNew] = useState(false);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [toolNotices, setToolNotices] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, pendingUser]);

  const streamMessage = useCallback(async (content: string) => {
    if (!selectedId || !content.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamingContent("");
    setToolNotices([]);
    // Show the user's message immediately (WhatsApp-style), even before the
    // server persists it. Cleared once the refetch returns the real record.
    setPendingUser(content);

    abortRef.current = new AbortController();
    let doneReceived = false;

    try {
      const res = await fetch(`${API_BASE}/api/conversations/${selectedId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

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
              setToolNotices(prev => [...prev, `${event.name}: ${event.result}`]);
            } else if (event.type === "done") {
              doneReceived = true;
            }
          } catch {
            // malformed event — skip
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "Erreur de connexion", description: "Impossible d'envoyer le message", variant: "destructive" });
      }
    } finally {
      // Await the refetch BEFORE clearing optimistic state so the bubbles don't
      // flicker out then back in.
      if (doneReceived) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getListMessagesQueryKey(selectedId) }),
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
        ]).catch(() => {});
      }
      setIsStreaming(false);
      setStreamingContent("");
      setToolNotices([]);
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNew && (
          <div className="px-3 py-2 border-b border-border bg-card">
            {/* Mode selector */}
            <div className="flex gap-1 flex-wrap mb-2">
              {MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                    mode === m.value ? "bg-primary text-primary-foreground" : cn("bg-secondary", modeColor[m.value])
                  )}
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
                onClick={() => deleteConv.mutate({ id: selectedConv.id })}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
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
                  </div>
                </div>
              ))}

              {/* Optimistic user bubble (shown immediately while streaming) */}
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
                    {/* Tool notices */}
                    {toolNotices.map((notice, i) => (
                      <div key={i} className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                        <Zap className="w-3 h-3 shrink-0" />
                        {notice}
                      </div>
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
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                className="flex-1 bg-secondary rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[40px] max-h-32"
                placeholder={isStreaming ? "En cours..." : "Envoyer un message..."}
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
        )}
      </div>
    </div>
  );
}
