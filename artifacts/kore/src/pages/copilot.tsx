import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, User } from "lucide-react";
import { getApiBase, apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Product {
  id: string;
  name: string;
  tagline: string;
  suggestions: string[];
}

const DEFAULT_SUGGESTIONS = [
  "Aide-moi à prioriser mes tâches du jour.",
  "Rédige un message de relance pour un prospect.",
  "Quelles questions poser avant une décision importante ?",
];

export default function Copilot() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>("tams");
  const endRef = useRef<HTMLDivElement>(null);

  const productsQuery = useQuery<{ products: Product[] }>({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ products: Product[] }>("/products"),
    staleTime: 5 * 60_000,
  });
  const products = productsQuery.data?.products ?? [];
  const active = products.find((p) => p.id === productId);
  const suggestions = active?.suggestions ?? DEFAULT_SUGGESTIONS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function switchProduct(id: string) {
    if (id === productId) return;
    setProductId(id);
    setMessages([]);
    setError(null);
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
        body: JSON.stringify({ messages: next, productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Le Copilot n'a pas pu répondre.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: String(data.reply ?? "") }]);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] max-w-3xl mx-auto pb-16 md:pb-0">
      <header className="px-6 md:px-8 pt-8 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-serif font-semibold text-foreground leading-none">Copilot</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {active?.tagline ?? "Ton assistant pour piloter ton activité"}
            </p>
          </div>
        </div>

        {products.length > 1 && (
          <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1 -mx-1 px-1">
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
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-foreground text-background max-w-[80%]"
                  : "bg-muted/50 text-foreground max-w-[85%]"
              }`}
            >
              {m.content}
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
    </div>
  );
}
