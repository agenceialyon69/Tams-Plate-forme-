import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AuthedLayout from "@/components/layout/AuthedLayout";
import { AGENT_LIST, AGENT_DEFINITIONS, selectBestAgent, runWithFallback } from "@/lib/agents";
import type { AgentId, AgentMessage } from "@/lib/agents";
import { listAgentRuns, logAgentRun, type AiAgentRun } from "@/lib/agent-sessions";
import {
  Send, Loader2, ChevronRight, Bot, User, Zap,
  Sparkles, X, Activity,
} from "lucide-react";

function AgentCard({
  agent, selected, onSelect,
}: {
  agent: typeof AGENT_LIST[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
          : "border-border/50 bg-card/20 hover:border-border hover:bg-card/40",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{agent.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-medium">{agent.name}</span>
            {selected && <Zap className="h-3.5 w-3.5 text-primary" />}
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{agent.role}</p>
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{agent.description}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {agent.tools.slice(0, 3).map(t => (
          <span key={t} className="rounded bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {t}
          </span>
        ))}
        {agent.tools.length > 3 && (
          <span className="rounded bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
            +{agent.tools.length - 3}
          </span>
        )}
      </div>
    </button>
  );
}

function MessageBubble({ msg }: { msg: AgentMessage & { agentEmoji?: string } }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
        isUser ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card/40"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : (msg.agentEmoji ?? <Bot className="h-4 w-4 text-muted-foreground" />)}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser
          ? "rounded-tr-sm bg-primary text-primary-foreground"
          : "rounded-tl-sm border border-border/40 bg-card/30"
      }`}>
        {msg.agent && !isUser && (
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-primary/60">
            {AGENT_DEFINITIONS[msg.agent]?.name ?? msg.agent}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
        <p className="mt-1 text-[10px] opacity-40">{new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
    </div>
  );
}

function StreamingBubble({ agentId, text }: { agentId: AgentId; text: string }) {
  const def = AGENT_DEFINITIONS[agentId];
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-sm">
        {def.emoji}
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border/40 bg-card/30 px-4 py-3">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-primary/60">
          {def.name}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
        <span className="inline-block h-3 w-1 animate-pulse bg-primary/60 ml-0.5" />
      </div>
    </div>
  );
}

export default function Agents() {
  const qc = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("executive");
  const [messages, setMessages] = useState<Array<AgentMessage & { agentEmoji?: string }>>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [autoRoute, setAutoRoute] = useState(true);
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("executive");
  const [showPanel, setShowPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runs = useQuery({
    queryKey: ["agent_runs", selectedAgent],
    queryFn: () => listAgentRuns(selectedAgent, 10),
  });

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");

    const agentId = autoRoute ? selectBestAgent(userMsg) : selectedAgent;
    setActiveAgentId(agentId);
    const def = AGENT_DEFINITIONS[agentId];

    const userMessage: AgentMessage & { agentEmoji?: string } = {
      role: "user",
      content: userMsg,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setStreaming(true);
    setStreamText("");

    const historyForAgent = messages.slice(-8).map(m => ({
      role: m.role,
      content: m.content,
      agent: m.agent,
      timestamp: m.timestamp,
    }));

    try {
      let accumulated = "";
      const result = await runWithFallback(
        agentId,
        userMsg,
        historyForAgent,
        {},
        (chunk) => {
          accumulated += chunk;
          setStreamText(accumulated);
        },
      );

      const agentMessage: AgentMessage & { agentEmoji?: string } = {
        role: "assistant",
        content: result.response,
        agent: agentId,
        agentEmoji: def.emoji,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, agentMessage]);

      // Log to Supabase (fire-and-forget)
      logAgentRun({
        session_id: null,
        agent_id: agentId,
        model_used: result.model_used,
        user_message: userMsg,
        agent_response: result.response,
        tokens_used: result.tokens_used,
        latency_ms: result.latency_ms,
      }).then(() => qc.invalidateQueries({ queryKey: ["agent_runs"] }));

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur agent");
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  }

  const def = AGENT_DEFINITIONS[selectedAgent];

  return (
    <AuthedLayout>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* Agent Panel */}
        <div className={`flex flex-col border-r border-border/50 bg-card/20 transition-all duration-300 ${showPanel ? "w-72" : "w-0 overflow-hidden"}`}>
          <div className="border-b border-border/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Agents disponibles</span>
              <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={autoRoute} onChange={e => setAutoRoute(e.target.checked)}
                  className="rounded"
                />
                Routage auto
              </label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 p-2">
            {AGENT_LIST.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedAgent === agent.id}
                onSelect={() => { setSelectedAgent(agent.id); if (!autoRoute) setActiveAgentId(agent.id); }}
              />
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/50 bg-card/20 px-4 py-2.5">
            <button onClick={() => setShowPanel(v => !v)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${showPanel ? "rotate-180" : ""}`} />
            </button>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xl">{AGENT_DEFINITIONS[activeAgentId].emoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{AGENT_DEFINITIONS[activeAgentId].name}</span>
                  {autoRoute && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Sparkles className="h-2.5 w-2.5" />
                      Auto-routing
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{AGENT_DEFINITIONS[activeAgentId].role}</p>
              </div>
            </div>
            <button
              onClick={() => setMessages([])}
              className="rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Effacer
            </button>
          </div>

          {/* Recent runs sidebar (right) */}
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 p-4">
                {messages.length === 0 && !streaming && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="mb-4 text-5xl">{def.emoji}</div>
                    <h2 className="text-lg font-medium mb-1">{def.name}</h2>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm">{def.description}</p>
                    <div className="text-xs text-muted-foreground/60 space-y-1">
                      <p className="font-medium">Capacités :</p>
                      {def.responsibilities.slice(0, 4).map(r => (
                        <p key={r}>• {r}</p>
                      ))}
                    </div>
                    {autoRoute && (
                      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary/70 max-w-sm">
                        <Sparkles className="inline h-3 w-3 mr-1" />
                        Routage automatique actif — le meilleur agent est sélectionné selon votre question.
                      </div>
                    )}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} />
                ))}
                {streaming && streamText && (
                  <StreamingBubble agentId={activeAgentId} text={streamText} />
                )}
                {streaming && !streamText && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/40 text-sm">
                      {AGENT_DEFINITIONS[activeAgentId].emoji}
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
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                      }}
                      placeholder={`Message ${def.emoji} ${def.name}… (Entrée pour envoyer)`}
                      rows={2}
                      className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <button onClick={handleSend} disabled={!input.trim() || streaming}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground/50">
                  <span>Propulsé par Pollinations.ai • Modèles gratuits</span>
                  <span>{AGENT_LIST.length} agents disponibles</span>
                </div>
              </div>
            </div>

            {/* Recent runs */}
            <div className="hidden xl:flex w-64 flex-col border-l border-border/50 bg-card/10">
              <div className="border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Runs récents</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {(runs.data ?? []).length === 0 && (
                  <p className="py-4 text-center text-[11px] text-muted-foreground/60">Aucun run.</p>
                )}
                {(runs.data ?? []).map((run: AiAgentRun) => (
                  <div key={run.id} className="rounded-lg border border-border/30 bg-card/10 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs">{AGENT_DEFINITIONS[run.agent_id]?.emoji ?? "🤖"}</span>
                      <span className="text-[11px] font-medium text-muted-foreground">{AGENT_DEFINITIONS[run.agent_id]?.name ?? run.agent_id}</span>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-foreground">{run.user_message}</p>
                    <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground/50">
                      <span>{run.latency_ms}ms</span>
                      <span>{run.tokens_used} tok</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthedLayout>
  );
}
