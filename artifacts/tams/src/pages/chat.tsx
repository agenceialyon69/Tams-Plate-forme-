import { useState, useRef, useEffect } from "react";
import {
  useListConversations, useCreateConversation, useGetConversation,
  useDeleteConversation, useListMessages, useSendMessage,
  getListConversationsQueryKey, getListMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2, MessageSquare, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MODES = [
  { value: "chat", label: "Conversation" },
  { value: "chief_of_staff", label: "Chef de Cabinet" },
  { value: "decision", label: "Décision" },
  { value: "red_team", label: "Red Team" },
  { value: "execution", label: "Exécution" },
] as const;

type Mode = typeof MODES[number]["value"];

const modeColor: Record<Mode, string> = {
  chat: "text-blue-400 bg-blue-500/10",
  chief_of_staff: "text-violet-400 bg-violet-500/10",
  decision: "text-amber-400 bg-amber-500/10",
  red_team: "text-red-400 bg-red-500/10",
  execution: "text-emerald-400 bg-emerald-500/10",
};

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showConvList, setShowConvList] = useState(true);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [newTitle, setNewTitle] = useState("");
  const [showNew, setShowNew] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: convLoading } = useListConversations();
  const { data: messages = [], isLoading: msgsLoading } = useListMessages(selectedId!, {
    query: { enabled: !!selectedId },
  });

  const createConv = useCreateConversation({
    mutation: {
      onSuccess: (conv) => {
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

  const sendMsg = useSendMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMessagesQueryKey(selectedId!) });
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setMessage("");
      },
      onError: () => toast({ title: "Erreur lors de l'envoi", variant: "destructive" }),
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!message.trim() || !selectedId || sendMsg.isPending) return;
    sendMsg.mutate({ id: selectedId, data: { content: message.trim() } });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const selectedConv = conversations.find(c => c.id === selectedId);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Conversation list */}
      <div className={cn(
        "flex flex-col border-r border-border bg-sidebar",
        "absolute inset-0 z-10 md:relative md:inset-auto md:z-auto md:w-64 md:shrink-0",
        !showConvList && "hidden md:flex"
      )}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
          <button
            data-testid="button-new-conversation"
            onClick={() => setShowNew(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNew && (
          <div className="px-3 py-2 border-b border-border bg-card animate-fade-in">
            <input
              data-testid="input-conversation-title"
              autoFocus
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring mb-2"
              placeholder="Titre de la conversation..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newTitle.trim()) { createConv.mutate({ data: { title: newTitle.trim(), mode } }); } if (e.key === "Escape") setShowNew(false); }}
            />
            <div className="flex flex-wrap gap-1 mb-2">
              {MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors", mode === m.value ? modeColor[m.value] : "bg-secondary text-muted-foreground hover:text-foreground")}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              data-testid="button-create-conversation"
              disabled={!newTitle.trim() || createConv.isPending}
              onClick={() => createConv.mutate({ data: { title: newTitle.trim(), mode } })}
              className="w-full py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              Créer
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {convLoading ? (
            <div className="space-y-2 px-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-accent rounded-xl animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <MessageSquare className="w-8 h-8 text-muted-foreground mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Aucune conversation</p>
              <p className="text-xs text-muted-foreground mt-1">Créez votre premier échange avec TAMS</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2 stagger">
              {conversations.map(conv => (
                <button
                  key={conv.id}
                  data-testid={`conv-item-${conv.id}`}
                  onClick={() => { setSelectedId(conv.id); setShowConvList(false); }}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-xl transition-all duration-150",
                    selectedId === conv.id ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", modeColor[conv.mode as Mode] ?? "bg-muted text-muted-foreground")}>
                      {MODES.find(m => m.value === conv.mode)?.label ?? conv.mode}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{conv.messageCount} msg</span>
                  </div>
                  <div className="text-sm font-medium text-foreground truncate">{conv.title}</div>
                  {conv.lastMessage && <div className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={cn(
        "flex-1 flex flex-col",
        showConvList && !selectedId && "hidden md:flex"
      )}>
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" strokeWidth={1} />
            <h3 className="text-lg font-medium text-foreground mb-1">Sélectionnez une conversation</h3>
            <p className="text-sm text-muted-foreground">ou créez-en une nouvelle pour commencer</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border shrink-0">
              <button
                data-testid="button-back-conversations"
                onClick={() => setShowConvList(true)}
                className="md:hidden p-1.5 rounded-lg hover:bg-accent text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{selectedConv?.title}</div>
                <div className={cn("text-xs font-medium", modeColor[selectedConv?.mode as Mode] ?? "text-muted-foreground")}>
                  {MODES.find(m => m.value === selectedConv?.mode)?.label}
                </div>
              </div>
              <button
                data-testid="button-delete-conversation"
                onClick={() => { if (window.confirm("Supprimer cette conversation ?")) deleteConv.mutate({ id: selectedId }); }}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {msgsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <div key={i} className={cn("h-16 rounded-2xl animate-pulse max-w-xs", i % 2 === 0 ? "bg-accent ml-auto" : "bg-card")} />)}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className={cn("px-3 py-1.5 rounded-full text-xs font-medium mb-4", modeColor[selectedConv?.mode as Mode] ?? "bg-muted text-muted-foreground")}>
                    {MODES.find(m => m.value === selectedConv?.mode)?.label ?? "Conversation"}
                  </div>
                  <p className="text-sm text-muted-foreground">Commencez la conversation</p>
                </div>
              ) : (
                <div className="space-y-4 stagger">
                  {messages.map(msg => (
                    <div key={msg.id} data-testid={`message-${msg.id}`} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role === "assistant" && (
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mr-2 mt-1 shrink-0">
                          <span className="text-[10px] font-bold text-primary">T</span>
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-card border border-card-border text-foreground rounded-tl-sm"
                      )}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        <div className={cn("text-[10px] mt-1.5", msg.role === "user" ? "text-primary-foreground/60 text-right" : "text-muted-foreground")}>
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {sendMsg.isPending && (
                    <div className="flex justify-start">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mr-2 mt-1 shrink-0">
                        <span className="text-[10px] font-bold text-primary">T</span>
                      </div>
                      <div className="bg-card border border-card-border px-4 py-3 rounded-2xl rounded-tl-sm">
                        <div className="flex gap-1.5 items-center h-4">
                          {[0, 1, 2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground" style={{ animation: `pulse-dot 1.4s ${i * .2}s ease infinite` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-border px-4 py-3 bg-sidebar">
              <div className="flex items-end gap-2 bg-input border border-border rounded-2xl px-4 py-2.5 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
                <textarea
                  data-testid="input-message"
                  rows={1}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Écrivez un message..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none max-h-32 leading-relaxed"
                  style={{ scrollbarWidth: "none" }}
                />
                <button
                  data-testid="button-send-message"
                  onClick={handleSend}
                  disabled={!message.trim() || sendMsg.isPending}
                  className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-all shrink-0 mb-0.5"
                >
                  <Send className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </div>
              <div className="flex items-center gap-1 mt-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                {MODES.map(m => (
                  <button key={m.value} onClick={() => setMode(m.value)} className={cn("text-[10px] font-medium px-2.5 py-1 rounded-full shrink-0 transition-colors", mode === m.value ? modeColor[m.value] : "bg-secondary text-muted-foreground hover:text-foreground")}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
