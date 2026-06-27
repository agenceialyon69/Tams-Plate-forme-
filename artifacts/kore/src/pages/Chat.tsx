import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import {
  listConversations, createConversation, archiveConversation,
  listMessages, addMessage,
  updateConversation,
  type Conversation, type Message,
} from "@/lib/chat";
import { selectBestAgent, runWithFallback, AGENT_DEFINITIONS } from "@/lib/agents";
import type { AgentId, AgentMessage } from "@/lib/agents";
import { supabase } from "@/lib/supabase";
import {
  MessageSquare, Plus, Send, Archive, User, Bot, Loader2,
  ChevronLeft, Slash, Info, Sparkles, ChevronRight,
} from "lucide-react";

// ─── Markdown renderer (pas de dépendance) ──────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-muted/40 px-1 py-0.5 font-mono text-xs">$1</code>')
    .replace(/^#{1,3} (.+)$/gm, "<strong class=\"text-foreground\">$1</strong>")
    .replace(/^• (.+)$/gm, "• $1")
    .replace(/^- (.+)$/gm, "• $1")
    .replace(/^(\d+)\. (.+)$/gm, "$1. $2")
    .replace(/\n\n/g, "</p><p class=\"mb-2\">")
    .replace(/\n/g, "<br/>");
}

// ─── Slash commands ──────────────────────────────────────────────────────────

interface SlashCommand {
  command: string;
  description: string;
  agentId?: AgentId;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/agent:executive", description: "Déléguer au Chief of Staff", agentId: "executive" },
  { command: "/agent:engineering", description: "Question technique / code", agentId: "engineering" },
  { command: "/agent:product", description: "Stratégie produit", agentId: "product" },
  { command: "/agent:business", description: "Analyse business", agentId: "business" },
  { command: "/agent:marketing", description: "Marketing & contenu", agentId: "marketing" },
  { command: "/agent:research", description: "Recherche & analyse", agentId: "research" },
  { command: "/agent:decision", description: "Aide à la décision", agentId: "decision" },
  { command: "/agent:redteam", description: "Challenger une idée", agentId: "redteam" },
  { command: "/agent:studio", description: "Créer du contenu", agentId: "studio" },
  { command: "/agent:devops", description: "Infrastructure & déploiement", agentId: "devops" },
  { command: "/image", description: "Générer une image (Pollinations.ai)" },
  { command: "/memory", description: "Rechercher dans la mémoire" },
  { command: "/task", description: "Créer une tâche" },
  { command: "/decision", description: "Créer une décision" },
  { command: "/help", description: "Afficher les commandes disponibles" },
];

function parseSlashCommand(input: string): { agentId: AgentId | null; cleanInput: string; command: string | null } {
  const trimmed = input.trim();
  for (const cmd of SLASH_COMMANDS) {
    if (trimmed.toLowerCase().startsWith(cmd.command)) {
      const rest = trimmed.slice(cmd.command.length).trim();
      return { agentId: cmd.agentId ?? null, cleanInput: rest || trimmed, command: cmd.command };
    }
  }
  return { agentId: null, cleanInput: trimmed, command: null };
}

// ─── Image generation via Pollinations.ai ───────────────────────────────────

function generateImageUrl(prompt: string): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;
}

// ─── Memory context ──────────────────────────────────────────────────────────

async function fetchMemoryContext(query: string): Promise<Array<{ title: string; content: string }>> {
  try {
    const { data } = await supabase
      .from("memory_nodes")
      .select("label, description")
      .ilike("label", `%${query.split(" ").slice(0, 3).join("%")}%`)
      .limit(5);
    if (!data) return [];
    return (data as Array<{ label: string; description: string | null }>).map(n => ({ title: n.label, content: n.description ?? "" }));
  } catch {
    return [];
  }
}

async function autoTitleConversation(convId: string, firstMessage: string): Promise<void> {
  const title = firstMessage.slice(0, 60).replace(/\n/g, " ").trim();
  await updateConversation(convId, { title: title || "Conversation" });
}

// ─── Components ─────────────────────────────────────────────────────────────

function ConversationItem({
  conv, selected, onClick, onArchive,
}: {
  conv: Conversation; selected: boolean; onClick: () => void; onArchive: () => void;
}) {
  return (
    <button onClick={onClick}
      className={[
        "group w-full rounded-lg px-3 py-2.5 text-left transition-colors",
        selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex-1 truncate text-sm">{conv.title}</span>
        <button onClick={e => { e.stopPropagation(); onArchive(); }}
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive"
        >
          <Archive className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="font-mono text-[10px] opacity-40">{conv.message_count} msg</span>
        {conv.last_message_at && (
          <span className="text-[10px] opacity-30">
            {new Date(conv.last_message_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
          </span>
        )}
      </div>
    </button>
  );
}

function AgentBadge({ agentId }: { agentId: AgentId }) {
  const def = AGENT_DEFINITIONS[agentId];
  if (!def) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-primary/60">
      <span>{def.emoji}</span>
      <span>{def.name}</span>
    </span>
  );
}

function MessageBubble({ msg, agentId }: { msg: Message; agentId?: AgentId | null }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-muted/30 px-3 py-1 text-[10px] text-muted-foreground">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] ${
        isUser ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card/40"
      }`}>
        {isUser ? <User className="h-3.5 w-3.5" /> : (
          agentId ? <span className="text-sm">{AGENT_DEFINITIONS[agentId]?.emoji ?? <Bot className="h-3.5 w-3.5 text-muted-foreground" />}</span>
          : <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border/40 bg-card/30"
      }`}>
        {!isUser && agentId && <AgentBadge agentId={agentId} />}

        {/* Check if message contains an image URL */}
        {!isUser && msg.content.startsWith("![image]") ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Image générée :</p>
            <img
              src={msg.content.replace("![image]", "").trim()}
              alt="Generated"
              className="rounded-xl max-w-full w-64 h-64 object-cover"
              onError={e => { (e.target as HTMLImageElement).alt = "Erreur de génération"; }}
            />
          </div>
        ) : (
          <p
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: isUser ? msg.content.replace(/\n/g, "<br/>") : renderMarkdown(msg.content) }}
          />
        )}
        <p className="mt-1 text-[10px] opacity-30">{new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
    </div>
  );
}

function StreamingBubble({ text, agentId }: { text: string; agentId: AgentId }) {
  const def = AGENT_DEFINITIONS[agentId];
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-sm">
        {def?.emoji ?? "🤖"}
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border/40 bg-card/30 px-4 py-3">
        {def && <AgentBadge agentId={agentId} />}
        <p className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) + '<span class="inline-block h-3 w-1 animate-pulse bg-primary/60 ml-0.5 align-middle" />' }}
        />
      </div>
    </div>
  );
}

function SlashCommandMenu({ query, onSelect }: { query: string; onSelect: (cmd: string) => void }) {
  const filtered = SLASH_COMMANDS.filter(c =>
    c.command.includes(query.toLowerCase()) || c.description.toLowerCase().includes(query.slice(1).toLowerCase())
  ).slice(0, 8);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full mb-1 left-0 right-0 rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden z-50">
      <div className="border-b border-border/50 px-3 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Commandes</span>
      </div>
      {filtered.map(cmd => (
        <button key={cmd.command} onClick={() => onSelect(cmd.command + " ")}
          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/30"
        >
          <span className="font-mono text-xs text-primary">{cmd.command}</span>
          <span className="text-xs text-muted-foreground">{cmd.description}</span>
          {cmd.agentId && (
            <span className="ml-auto text-xs">{AGENT_DEFINITIONS[cmd.agentId]?.emoji}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Chat() {
  const qc = useQueryClient();
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamAgentId, setStreamAgentId] = useState<AgentId>("executive");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSlash, setShowSlash] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<AgentId | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({ queryKey: ["conversations"], queryFn: listConversations });
  const messages = useQuery({
    queryKey: ["messages", convId],
    queryFn: () => listMessages(convId!),
    enabled: !!convId,
    refetchInterval: false,
  });

  const currentConv = (conversations.data ?? []).find(c => c.id === convId);

  const archiveMut = useMutation({
    mutationFn: archiveConversation,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (convId === id) setConvId(null);
      toast.success("Archivée");
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data, streaming, streamText]);

  // Auto-detect slash command
  useEffect(() => {
    if (input.startsWith("/")) setShowSlash(true);
    else setShowSlash(false);
  }, [input]);

  async function getOrCreateConv(): Promise<string> {
    if (convId) return convId;
    const conv = await createConversation({ title: "Conversation" });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    setConvId(conv.id);
    return conv.id;
  }

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const userInput = input.trim();
    setInput("");
    setShowSlash(false);

    const { agentId: forcedAgent, cleanInput, command } = parseSlashCommand(userInput);

    // Handle /image command
    if (command === "/image" && cleanInput) {
      const cId = await getOrCreateConv();
      if (messages.data?.length === 0) {
        await autoTitleConversation(cId, cleanInput);
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }
      await addMessage({ conversation_id: cId, role: "user", content: userInput, model: null });
      qc.invalidateQueries({ queryKey: ["messages", cId] });
      const imageUrl = generateImageUrl(cleanInput);
      await addMessage({ conversation_id: cId, role: "assistant", content: `![image]${imageUrl}`, model: "pollinations-image" });
      qc.invalidateQueries({ queryKey: ["messages", cId] });
      return;
    }

    // Handle /help command
    if (command === "/help") {
      const cId = await getOrCreateConv();
      await addMessage({ conversation_id: cId, role: "user", content: "/help", model: null });
      const helpText = SLASH_COMMANDS.map(c => `**${c.command}** — ${c.description}`).join("\n");
      await addMessage({ conversation_id: cId, role: "assistant", content: `Commandes disponibles :\n\n${helpText}`, model: null });
      qc.invalidateQueries({ queryKey: ["messages", cId] });
      return;
    }

    // Select agent (forced or auto-routed)
    const agentId = forcedAgent ?? selectBestAgent(cleanInput);
    setCurrentAgentId(agentId);
    setStreamAgentId(agentId);

    const cId = await getOrCreateConv();
    const allMsgs = messages.data ?? [];

    // Auto-title first message
    if (allMsgs.length === 0) {
      void autoTitleConversation(cId, cleanInput).then(() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });
    }

    // Store user message
    await addMessage({ conversation_id: cId, role: "user", content: userInput, model: null });
    qc.invalidateQueries({ queryKey: ["messages", cId] });

    setStreaming(true);
    setStreamText("");

    // Build history for agent
    const historyForAgent: AgentMessage[] = allMsgs.slice(-8).map(m => ({
      role: m.role as AgentMessage["role"],
      content: m.content,
      timestamp: m.created_at,
    }));

    // Fetch memory context
    const memContext = await fetchMemoryContext(cleanInput);

    try {
      let accumulated = "";
      const result = await runWithFallback(
        agentId,
        cleanInput,
        historyForAgent,
        { memories: memContext },
        (chunk) => {
          accumulated += chunk;
          setStreamText(accumulated);
        },
      );

      // Store assistant message
      await addMessage({
        conversation_id: cId,
        role: "assistant",
        content: result.response,
        model: `${agentId}:${result.model_used}`,
      });
      qc.invalidateQueries({ queryKey: ["messages", cId], exact: true });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  }

  function getMessageAgent(msg: Message): AgentId | null {
    if (!msg.model || msg.role !== "assistant") return null;
    const parts = msg.model.split(":");
    if (parts.length >= 2) {
      const agentId = parts[0] as AgentId;
      if (agentId in AGENT_DEFINITIONS) return agentId;
    }
    return null;
  }

  const QUICK_STARTERS = [
    { text: "📊 Analyse ma semaine", prompt: "Analyse mes priorités et objectifs de la semaine. Qu'est-ce que je devrais faire en premier ?" },
    { text: "⚖️ Aide-moi à décider", prompt: "/agent:decision J'ai une décision difficile à prendre. Aide-moi à la structurer." },
    { text: "🔴 Red Team une idée", prompt: "/agent:redteam Challenge cette idée : " },
    { text: "🚀 Plan de lancement", prompt: "/agent:marketing Crée un plan de lancement produit pour " },
  ];

  return (
    <AuthedLayout>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* Sidebar */}
        <div className={`flex flex-col border-r border-border/50 bg-card/20 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}>
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-3">
            <span className="text-sm font-medium">Conversations</span>
            <button onClick={async () => {
              const conv = await createConversation({ title: "Nouvelle conversation" });
              qc.invalidateQueries({ queryKey: ["conversations"] });
              setConvId(conv.id);
            }}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            >
              <Plus className="h-3 w-3" />
              Nouveau
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {(conversations.data ?? []).length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground/60">
                Aucune conversation.<br />Tapez un message pour commencer.
              </p>
            )}
            {(conversations.data ?? []).map(conv => (
              <ConversationItem key={conv.id} conv={conv} selected={convId === conv.id}
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
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MessageSquare className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{currentConv?.title ?? "Chat OS"}</span>
              {currentAgentId && !streaming && (
                <span className="ml-1 text-xs text-muted-foreground/60 shrink-0">
                  via {AGENT_DEFINITIONS[currentAgentId]?.emoji}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                <Sparkles className="h-2.5 w-2.5" />
                IA Gratuite
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!convId && !streaming && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="mb-4 text-5xl">💬</div>
                <h2 className="text-xl font-semibold mb-2">Chat OS</h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-md">
                  90% des actions TAMS depuis le chat. Tapez <code className="bg-muted/40 px-1 rounded text-xs">/</code> pour voir les commandes.
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                  {QUICK_STARTERS.map(s => (
                    <button key={s.text} onClick={() => setInput(s.prompt)}
                      className="rounded-xl border border-border/50 bg-card/20 px-3 py-2.5 text-left text-xs text-muted-foreground hover:bg-card/40 hover:text-foreground transition-colors"
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-1.5 max-w-md">
                  {["/agent:executive", "/agent:redteam", "/image", "/decision", "/help"].map(cmd => (
                    <button key={cmd} onClick={() => setInput(cmd + " ")}
                      className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-primary/60 hover:border-primary/30 hover:text-primary"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(messages.data ?? []).map(msg => (
              <MessageBubble key={msg.id} msg={msg} agentId={getMessageAgent(msg)} />
            ))}

            {streaming && streamText && (
              <StreamingBubble text={streamText} agentId={streamAgentId} />
            )}

            {streaming && !streamText && (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-sm">
                  {AGENT_DEFINITIONS[streamAgentId]?.emoji ?? "🤖"}
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border/40 bg-card/30 px-4 py-3">
                  {[0,1,2].map(i => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border/50 bg-card/10 p-4">
            <div className="relative">
              {showSlash && (
                <SlashCommandMenu
                  query={input}
                  onSelect={(cmd) => setInput(cmd)}
                />
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Escape") setShowSlash(false);
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="Message… ou / pour une commande"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button onClick={() => setInput("/")}
                    className="absolute right-2.5 bottom-3 text-muted-foreground/40 hover:text-muted-foreground"
                    title="Commandes"
                  >
                    <Slash className="h-4 w-4" />
                  </button>
                </div>
                <button onClick={handleSend} disabled={!input.trim() || streaming}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/40">
              Routing automatique par agents • Images Pollinations.ai • Contexte mémoire • Shift+Entrée pour nouvelle ligne
            </p>
          </div>
        </div>
      </div>
    </AuthedLayout>
  );
}
