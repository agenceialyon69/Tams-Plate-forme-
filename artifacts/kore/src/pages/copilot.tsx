import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, User, Globe, History, Plus, Trash2, X } from "lucide-react";
import { getApiBase, apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface Source {
  title: string;
  url: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface Product {
  id: string;
  name: string;
  tagline: string;
  suggestions: string[];
}

interface Conversation {
  conversationId: string;
  title: string;
  updatedAt: string;
  count: number;
}

const DEFAULT_SUGGESTIONS = [
  "Aide-moi à prioriser mes tâches du jour.",
  "Rédige un message de relance pour un prospect.",
  "Quelles questions poser avant une décision importante ?",
];

const CONV_KEY = "tams_copilot_conv";

export default function Copilot() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>("tams");
  const [webSearch, setWebSearch] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => localStorage.getItem(CONV_KEY));
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const productsQuery = useQuery<{ products: Product[] }>({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ products: Product[] }>("/products"),
    staleTime: 5 * 60_000,
  });
  const products = productsQuery.data?.products ?? [];
  const active = products.find((p) => p.id === productId);
  const suggestions = active?.suggestions ?? DEFAULT_SUGGESTIONS;

  const conversationsQuery = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["copilot-conversations"],
    queryFn: () => apiFetch<{ conversations: Conversation[] }>("/copilot/conversations"),
  });
  const conversations = conversationsQuery.data?.conversations ?? [];

  // Resume the last conversation on mount so the Copilot "remembers".
  useEffect(() => {
    const id = localStorage.getItem(CONV_KEY);
    if (!id) return;
    apiFetch<{ messages: Msg[] }>(`/copilot/conversations/${id}`)
      .then((d) => { if (Array.isArray(d.messages) && d.messages.length) setMessages(d.messages); })
      .catch(() => { localStorage.removeItem(CONV_KEY); setConversationId(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function setConversation(id: string | null) {
    setConversationId(id);
    if (id) localStorage.setItem(CONV_KEY, id);
    else localStorage.removeItem(CONV_KEY);
  }

  function newConversation() {
    setMessages([]);
    setConversation(null);
    setError(null);
    setShowHistory(false);
  }

  async function resumeConversation(id: string) {
    setShowHistory(false);
    setError(null);
    try {
      const d = await apiFetch<{ messages: Msg[] }>(`/copilot/conversations/${id}`);
      setMessages(d.messages ?? []);
      setConversation(id);
    } catch {
      setError("Impossible de charger la conversation.");
    }
  }

  async function deleteConversation(id: string) {
    try {
      await apiFetch(`/copilot/conversations/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["copilot-conversations"] });
      if (id === conversationId) newConversation();
    } catch {
      setError("Suppression impossible.");
    }
  }

  function switchProduct(id: string) {
    if (id === productId) return;
    setProductId(id);
    newConversation();
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ messages: next, productId, webSearch, conversationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Le Copilot n'a pas pu répondre.");
        return;
      }
      if (typeof data.conversationId === "string") {
        setConversation(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["copilot-conversations"] });
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: String(data.reply ?? ""), sources: Array.isArray(data.sources) ? data.sources : [] },
      ]);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] max-w-3xl mx-auto pb-16 md:pb-0 relative">
      <header className="px-6 md:px-8 pt-8 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-serif font-semibold text-foreground leading-none">Copilot</h1>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {active?.tagline ?? "Ton assistant pour piloter ton activité"}
            </p>
          </div>
          <button
            onClick={newConversation}
            title="Nouvelle conversation"
            className="shrink-0 w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/40 flex items-center justify-center"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            title="Historique des conversations"
            className="shrink-0 w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/40 flex items-center justify-center"
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4">
          {products.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 flex-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => switchProduct(p.id)}
                  className={`text-xs whitespace-nowrap px-3 py-1.5 rounded-full border transition-colors ${
                    p.id === productId
                      ? "bg-foreground text-background border-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setWebSearch((v) => !v)}
            title="Rechercher sur le web pour répondre"
            className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              webSearch
                ? "bg-accent/10 border-accent text-accent"
                : "border-border/60 text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Web
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground pt-10 space-y-5">
            <Sparkles className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm">Pose une question ou choisis une suggestion.</p>
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-3 py-2 rounded-lg border border-border/50 bg-background/40 hover:bg-muted/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-accent" />
              </div>
            )}
            <div className="max-w-[85%] space-y-1.5">
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user" ? "bg-foreground text-background" : "bg-muted/50 text-foreground"
                }`}
              >
                {m.content}
              </div>
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.sources.slice(0, 5).map((s, j) => (
                    <a
                      key={j}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      title={s.title}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/40"
                    >
                      <Globe className="w-3 h-3" /> {(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return "source"; } })()}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/40 px-4 md:px-8 py-4">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder="Écris ton message… (Entrée pour envoyer)"
            rows={1}
            className="resize-none min-h-[44px] max-h-40"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} className="shrink-0 h-11 w-11">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>

      {/* Conversation history drawer */}
      {showHistory && (
        <div className="absolute inset-0 z-30 flex" onClick={() => setShowHistory(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative ml-auto w-80 max-w-[85%] h-full bg-card border-l border-border shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
              <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={newConversation}
              className="m-3 inline-flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/40"
            >
              <Plus className="w-4 h-4" /> Nouvelle conversation
            </button>
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
              {conversationsQuery.isLoading && (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              )}
              {conversations.length === 0 && !conversationsQuery.isLoading && (
                <p className="text-xs text-muted-foreground text-center py-6">Aucune conversation enregistrée.</p>
              )}
              {conversations.map((c) => (
                <div
                  key={c.conversationId}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    c.conversationId === conversationId ? "bg-accent/10" : "hover:bg-muted/40"
                  }`}
                  onClick={() => resumeConversation(c.conversationId)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString("fr-FR")} · {c.count} msg</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(c.conversationId); }}
                    title="Supprimer"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
