import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  listConversations, createConversation, archiveConversation,
  listMessages, addMessage,
  type Conversation, type Message,
} from "@/lib/chat";
import {
  MessageSquare, Plus, Send, Archive, User, Bot, Loader2,
  ChevronLeft, Settings,
} from "lucide-react";

const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet",
  "claude-3-haiku",
];

function ConversationItem({
  conv, selected, onClick, onArchive,
}: {
  conv: Conversation;
  selected: boolean;
  onClick: () => void;
  onArchive: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "group w-full rounded-lg px-3 py-2.5 text-left transition-colors",
        selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex-1 truncate text-sm">{conv.title}</span>
        <button
          onClick={e => { e.stopPropagation(); onArchive(); }}
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive"
        >
          <Archive className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="font-mono text-[10px] opacity-50">{conv.model}</span>
        <span className="text-[10px] opacity-40">{conv.message_count} msg</span>
      </div>
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] ${isUser ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card/40 text-muted-foreground"}`}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isUser ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border/50 bg-card/30 text-foreground"}`}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
        {(msg.tokens_in != null || msg.latency_ms != null) && (
          <p className="mt-1 font-mono text-[10px] opacity-50">
            {msg.tokens_in != null ? `${msg.tokens_in}↑` : ""}
            {msg.tokens_out != null ? ` ${msg.tokens_out}↓` : ""}
            {msg.latency_ms != null ? ` ${msg.latency_ms}ms` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-muted-foreground">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border/50 bg-card/30 px-4 py-3">
        {[0, 1, 2].map(i => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function SystemPromptEditor({ value, onChange, model, onModelChange }: {
  value: string; onChange: (v: string) => void;
  model: string; onModelChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Settings className="h-3 w-3" />
        {open ? "Masquer" : "Configurer"} le contexte
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-border/50 bg-card/20 p-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Modèle</label>
            <select value={model} onChange={e => onModelChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none"
            >
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Prompt système</label>
            <textarea
              value={value} onChange={e => onChange(e.target.value)}
              placeholder="Tu es TAMS, un assistant startup OS expert. Réponds de façon concise, orientée action."
              rows={4}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const qc = useQueryClient();
  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("Tu es TAMS, un assistant expert en stratégie startup et opérations. Réponds de façon concise, orientée action et décision.");
  const [model, setModel] = useState("gemini-2.0-flash");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({ queryKey: ["conversations"], queryFn: listConversations });
  const messages = useQuery({
    queryKey: ["messages", convId],
    queryFn: () => listMessages(convId!),
    enabled: !!convId,
    refetchInterval: false,
  });

  const currentConv = (conversations.data ?? []).find(c => c.id === convId);

  const createConvMut = useMutation({
    mutationFn: () => createConversation({ model, system_prompt: systemPrompt }),
    onSuccess: (conv) => { inv(["conversations"]); setConvId(conv.id); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const archiveMut = useMutation({
    mutationFn: archiveConversation,
    onSuccess: (_, id) => {
      inv(["conversations"]);
      if (convId === id) setConvId(null);
      toast.success("Conversation archivée");
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data, typing]);

  async function generateReply(userContent: string, msgs: Message[]): Promise<string> {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
    const lower = userContent.toLowerCase();
    if (lower.includes("bonjour") || lower.includes("salut") || lower.includes("hello")) {
      return `Bonjour ! Je suis TAMS, votre assistant startup OS. Comment puis-je vous aider aujourd'hui ?\n\nVous pouvez me demander d'analyser une situation stratégique, de structurer une décision, ou de vous aider sur vos opérations.`;
    }
    if (lower.includes("risque") || lower.includes("risk")) {
      return `Pour évaluer ce risque, voici ma grille :\n\n**1. Probabilité** : Haute / Moyenne / Faible\n**2. Impact** : Critique / Significatif / Limité\n**3. Mitigation** : Actions concrètes à prendre\n\nPouvez-vous me donner plus de contexte sur le risque spécifique que vous souhaitez analyser ?`;
    }
    if (lower.includes("décision") || lower.includes("choisir")) {
      return `Pour structurer cette décision, je vous suggère :\n\n**Critères clés** : Listez vos 3-5 critères de décision\n**Options** : Identifiez clairement les alternatives\n**Red Team** : Quel est l'argument le plus fort *contre* votre choix préféré ?\n\nQuelle est la décision à prendre ?`;
    }
    if (lower.includes("priorité") || lower.includes("priorités")) {
      return `Pour prioriser efficacement :\n\n🔴 **Critique** : Impact fort, urgent\n🟡 **Important** : Impact fort, non urgent\n🟢 **À planifier** : Impact faible, non urgent\n⬜ **À déléguer** : Impact faible ou délégable\n\nQuelles sont vos actions ou projets à prioriser ?`;
    }
    const replies = [
      `C'est une question pertinente. En tant que startup OS, voici mon analyse :\n\nLa clé est de distinguer ce qui est **urgent** de ce qui est **important**. Pour avancer sur ce point, je vous recommande de :\n\n1. Clarifier l'objectif principal\n2. Identifier les blocages concrets\n3. Définir la prochaine action la plus petite possible\n\nQue souhaitez-vous approfondir ?`,
      `Excellente réflexion. Voici comment je structurerais ça :\n\n**Contexte** : Ce que vous décrivez suggère un enjeu de clarté opérationnelle.\n\n**Recommandation** : Commencez par aligner votre équipe sur une seule métrique de succès pour ce trimestre.\n\nVoulez-vous qu'on explore les options ensemble ?`,
      `Je vois plusieurs angles pour aborder ça. Le plus important est de rester **orienté résultats** et non processus.\n\n**Action immédiate** : Définissez ce que "succès" signifie dans 90 jours.\n\n**Question** : Qu'est-ce qui vous empêche d'agir sur ce point aujourd'hui ?`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  async function handleSend() {
    if (!input.trim() || typing) return;
    let cId = convId;
    if (!cId) {
      try {
        const conv = await createConversation({ model, system_prompt: systemPrompt });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        cId = conv.id;
        setConvId(conv.id);
      } catch (e) {
        toast.error("Impossible de créer la conversation");
        return;
      }
    }
    const userMsg = input.trim();
    setInput("");
    const allMsgs = messages.data ?? [];
    try {
      await addMessage({ conversation_id: cId, role: "user", content: userMsg, model: null });
      qc.invalidateQueries({ queryKey: ["messages", cId] });
      setTyping(true);
      const reply = await generateReply(userMsg, allMsgs);
      await addMessage({ conversation_id: cId, role: "assistant", content: reply, model });
      qc.invalidateQueries({ queryKey: ["messages", cId], exact: true });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setTyping(false);
    }
  }

  return (
    <AuthedLayout>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* Sidebar */}
        <div className={`flex flex-col border-r border-border/50 bg-card/20 transition-all ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}>
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-3">
            <span className="text-sm font-medium">Conversations</span>
            <button onClick={() => createConvMut.mutate()}
              disabled={createConvMut.isPending}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              Nouveau
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {(conversations.data ?? []).length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground/60">Aucune conversation.<br />Cliquez sur "Nouveau".</p>
            )}
            {(conversations.data ?? []).map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                selected={convId === conv.id}
                onClick={() => setConvId(conv.id)}
                onArchive={() => archiveMut.mutate(conv.id)}
              />
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/50 bg-card/20 px-4 py-2.5">
            <button onClick={() => setSidebarOpen(v => !v)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <ChevronLeft className={`h-4 w-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
            </button>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{currentConv?.title ?? "TAMS Chat"}</span>
              {currentConv?.model && (
                <span className="rounded-full bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{currentConv.model}</span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!convId && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <h2 className="text-lg font-medium mb-1">TAMS Chat</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  Votre assistant startup OS. Posez vos questions stratégiques, opérationnelles ou de décision.
                </p>
                <div className="w-full max-w-md">
                  <SystemPromptEditor
                    value={systemPrompt} onChange={setSystemPrompt}
                    model={model} onModelChange={setModel}
                  />
                </div>
              </div>
            )}

            {convId && (messages.data ?? []).length === 0 && !typing && (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground/60">
                Commencez la conversation…
              </div>
            )}

            {(messages.data ?? []).map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {typing && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border/50 bg-card/10 p-4">
            {!convId && (
              <div className="mb-3">
                <SystemPromptEditor
                  value={systemPrompt} onChange={setSystemPrompt}
                  model={model} onModelChange={setModel}
                />
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Posez votre question… (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || typing}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {typing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/50">
              TAMS génère des réponses simulées. Connectez un LLM réel dans Studio → Outils.
            </p>
          </div>
        </div>
      </div>
    </AuthedLayout>
  );
}
