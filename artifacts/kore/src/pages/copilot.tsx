import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Send, Loader2, User, Globe, History,
  Plus, Trash2, X, MoreVertical, Search, ChevronLeft,
  CheckCheck, Mic, Paperclip, Smile, Menu, Settings,
  MessageCircle, Phone, Video, Image, FileText, Archive,
  Bot, ArrowLeft, Copy, ThumbsUp, ThumbsDown, RefreshCw,
  Shield, AlertTriangle, Upload, File, Music,
} from "lucide-react";
import { getApiBase, apiFetch } from "@/lib/api";
import { getToken, getStoredUser } from "@/lib/auth";

interface Source { title: string; url: string; }
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  ts?: number;
  files?: AttachedFile[];
}
interface Product { id: string; name: string; tagline: string; suggestions: string[]; }
interface Conversation { conversationId: string; title: string; updatedAt: string; count: number; }
interface AttachedFile {
  name: string;
  type: string;
  size: number;
  data: string;
  preview?: string;
}

const DEFAULT_SUGGESTIONS = [
  "Aide-moi a prioriser mes taches du jour.",
  "Redige un message de relance pour un prospect.",
  "Quelles questions poser avant une decision importante ?",
  "Analyse les risques de mon projet actuel.",
];

const AUDIT_SUGGESTIONS = [
  "Analyse ce document et identifie les risques.",
  "Quels sont les angles morts de ce projet ?",
  "Quelles objections peut-on anticiper ?",
  "Recommande des actions pour reduire les risques.",
];

const CONV_KEY = "tams_copilot_conv";

const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
  "text/plain", "text/markdown", "text/csv",
  "application/json",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function getFileIcon(type: string): React.ElementType {
  if (type.startsWith("image/")) return Image;
  if (type.startsWith("video/")) return Video;
  if (type.startsWith("audio/")) return Music;
  if (type === "application/pdf") return FileText;
  return File;
}

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-primary animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

function FileChip({ file, onRemove }: { file: AttachedFile; onRemove: () => void }) {
  const Icon = getFileIcon(file.type);
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border border-border/50 rounded-xl">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-foreground truncate max-w-[120px]">{file.name}</span>
      <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
      <button
        onClick={onRemove}
        className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function Copilot() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>("tams");
  const [webSearch, setWebSearch] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try { return localStorage.getItem(CONV_KEY); } catch { return null; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditMode, setAuditMode] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const user = getStoredUser();

  const productsQuery = useQuery<{ products: Product[] }>({
    queryKey: ["products"],
    queryFn: () => apiFetch<{ products: Product[] }>("/products"),
    staleTime: 5 * 60_000,
  });
  const products = productsQuery.data?.products ?? [];
  const active = products.find((p) => p.id === productId);
  const suggestions = auditMode ? AUDIT_SUGGESTIONS : (active?.suggestions ?? DEFAULT_SUGGESTIONS);

  const conversationsQuery = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["copilot-conversations"],
    queryFn: () => apiFetch<{ conversations: Conversation[] }>("/copilot/conversations"),
  });
  const conversations = conversationsQuery.data?.conversations ?? [];
  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const id = localStorage.getItem(CONV_KEY);
    if (!id) return;
    apiFetch<{ messages: Msg[] }>(`/copilot/conversations/${id}`)
      .then((d) => {
        if (Array.isArray(d.messages) && d.messages.length) {
          setMessages(d.messages.map((m) => ({ ...m, id: `msg-${Date.now()}-${Math.random()}`, ts: m.ts ?? Date.now() })));
        }
      })
      .catch(() => { try { localStorage.removeItem(CONV_KEY); } catch {} setConversationId(null); });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showMenu]);

  function setConversation(id: string | null) {
    setConversationId(id);
    try {
      if (id) localStorage.setItem(CONV_KEY, id);
      else localStorage.removeItem(CONV_KEY);
    } catch {}
  }

  function newConversation() {
    setMessages([]);
    setConversation(null);
    setError(null);
    setShowHistory(false);
    setShowMenu(false);
    setAttachedFiles([]);
    setAuditMode(false);
  }

  async function resumeConversation(id: string) {
    setShowHistory(false);
    setError(null);
    try {
      const d = await apiFetch<{ messages: Msg[] }>(`/copilot/conversations/${id}`);
      setMessages((d.messages ?? []).map((m) => ({ ...m, id: `msg-${Date.now()}-${Math.random()}`, ts: m.ts ?? Date.now() })));
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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < Math.min(files.length, 5 - attachedFiles.length); i++) {
      const file = files[i];
      if (!ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith("text/")) {
        setError(`Type non supporte: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`Fichier trop volumineux: ${file.name} (max 25 Mo)`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        const base64 = data.split(",")[1] || data;
        const attached: AttachedFile = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64,
          preview: file.type.startsWith("image/") ? data : undefined,
        };
        setAttachedFiles((prev) => [...prev, attached]);
      };
      reader.readAsDataURL(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendAudit() {
    if (attachedFiles.length === 0 || loading) return;
    setError(null);
    setLoading(true);

    const ts = Date.now();
    const fileList = attachedFiles.map(f => f.name).join(", ");
    const userMsg: Msg = {
      id: `msg-${ts}`,
      role: "user",
      content: `[Audit Red Team] Analyser: ${fileList}`,
      files: attachedFiles,
      ts,
    };
    setMessages((prev) => [...prev, userMsg]);
    setAttachedFiles([]);

    try {
      const res = await fetch(`${getApiBase()}/api/copilot/audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({
          files: attachedFiles.map(f => ({
            filename: f.name,
            mimetype: f.type,
            data: f.data,
          })),
          context: input.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "L'audit a echoue.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: String(data.reply ?? ""),
          ts: Date.now(),
        },
      ]);
      setAuditMode(false);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);
    const ts = Date.now();
    const userMsg: Msg = { id: `msg-${ts}`, role: "user", content, ts };
    if (attachedFiles.length > 0) {
      userMsg.files = [...attachedFiles];
    }
    const next: Msg[] = [...messages, userMsg];
    setMessages(next);
    setInput("");
    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const res = await fetch(`${getApiBase()}/api/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify({ messages: next, productId, webSearch, conversationId, files: filesToSend.length > 0 ? filesToSend : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Le Copilot n'a pas pu repondre.");
        return;
      }
      if (typeof data.conversationId === "string") {
        setConversation(data.conversationId);
        queryClient.invalidateQueries({ queryKey: ["copilot-conversations"] });
      }
      setMessages((m) => [
        ...m,
        {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: String(data.reply ?? ""),
          sources: Array.isArray(data.sources) ? data.sources : [],
          ts: Date.now(),
        },
      ]);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }, [messages, productId, webSearch, conversationId, loading, queryClient]);

  const grouped: { date: string; msgs: Msg[] }[] = [];
  for (const m of messages) {
    const d = formatDate(m.ts) || "Aujourd'hui";
    const last = grouped[grouped.length - 1];
    if (last?.date === d) last.msgs.push(m);
    else grouped.push({ date: d, msgs: [m] });
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background safe-area-inset md:relative md:inset-auto md:h-full">
      {/* -- MOBILE HEADER -- */}
      <header className="shrink-0 flex items-center gap-2 px-2 py-2 bg-primary text-primary-foreground sticky top-0 z-30 md:rounded-t-2xl">
        <button
          onClick={() => setShowHistory(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-primary-foreground/10 transition-colors md:hidden"
        >
          <History className="w-5 h-5" />
        </button>

        <div className="w-11 h-11 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0 shadow-lg">
          {auditMode ? (
            <Shield className="w-6 h-6 text-primary-foreground" />
          ) : (
            <Bot className="w-6 h-6 text-primary-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-primary-foreground truncate">
              {auditMode ? "Audit Red Team" : (active?.name ?? "TAMS Copilot")}
            </p>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          </div>
          <p className="text-xs text-primary-foreground/70 truncate">
            {loading ? "en train d'ecrire..." : "En ligne"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {attachedFiles.length > 0 && (
            <span className="text-xs bg-primary-foreground/20 px-2 py-1 rounded-full">
              {attachedFiles.length} fichier{attachedFiles.length > 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => setWebSearch((v) => !v)}
            title="Recherche web"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              webSearch ? "bg-primary-foreground/20 text-primary-foreground" : "text-primary-foreground/70 hover:bg-primary-foreground/10"
            }`}
          >
            <Globe className="w-5 h-5" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-12 w-64 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden z-50">
                <button
                  onClick={newConversation}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-popover-foreground hover:bg-muted/50 transition-colors"
                >
                  <Plus className="w-5 h-5 text-primary" />
                  <span className="font-medium">Nouvelle conversation</span>
                </button>
                <button
                  onClick={() => { setAuditMode((v) => !v); setShowMenu(false); setAttachedFiles([]); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-popover-foreground hover:bg-muted/50 transition-colors"
                >
                  <Shield className={`w-5 h-5 ${auditMode ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-medium">Mode Audit Red Team</span>
                  {auditMode && (
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">Actif</span>
                  )}
                </button>
                <button
                  onClick={() => { setWebSearch((v) => !v); setShowMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-popover-foreground hover:bg-muted/50 transition-colors"
                >
                  <Globe className={`w-5 h-5 ${webSearch ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-medium">Recherche web</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${webSearch ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {webSearch ? "ON" : "OFF"}
                  </span>
                </button>
                {products.length > 1 && (
                  <div className="border-t border-border/40 p-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-1.5">Mode</p>
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setProductId(p.id); newConversation(); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                          p.id === productId && !auditMode ? "bg-primary/10 text-primary font-medium" : "text-popover-foreground hover:bg-muted/50"
                        }`}
                      >
                        <MessageCircle className="w-4 h-4" />
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {messages.length > 0 && (
                  <button
                    onClick={() => { newConversation(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-destructive hover:bg-destructive/5 transition-colors border-t border-border/40"
                  >
                    <Trash2 className="w-5 h-5" />
                    Effacer la conversation
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* -- MESSAGES AREA -- */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4 py-3 space-y-1 bg-muted/30">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-6 space-y-5">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl ${
              auditMode
                ? "bg-gradient-to-br from-destructive/30 to-destructive/10"
                : "bg-gradient-to-br from-primary/30 to-primary/10"
            }`}>
              {auditMode ? (
                <Shield className="w-10 h-10 text-destructive" />
              ) : (
                <Sparkles className="w-10 h-10 text-primary" />
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xl font-bold text-foreground">
                {auditMode ? "Mode Audit Red Team" : `Bonjour${user?.name ? `, ${user.name.split(" ")[0]}` : ""} !`}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {auditMode
                  ? "Depose tes fichiers pour une analyse de risques, angles morts et recommandations."
                  : (active?.tagline ?? "Ton assistant IA pour piloter ton activite comme un pro.")}
              </p>
            </div>
            {auditMode && attachedFiles.length === 0 && (
              <div className="w-full max-w-md pt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES.join(",")}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed border-border bg-card hover:border-primary/40 hover:bg-card/80 transition-all"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium text-foreground">Deposer des fichiers</p>
                    <p className="text-xs text-muted-foreground mt-1">Images, PDF, videos, audio (max 25 Mo chacun)</p>
                  </div>
                </button>
              </div>
            )}
            <div className="w-full max-w-md space-y-2.5 pt-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="w-full text-left text-sm px-4 py-3.5 rounded-2xl border border-border/60 bg-card hover:bg-card/80 hover:border-primary/30 hover:shadow-md transition-all text-foreground leading-relaxed flex items-start gap-3"
                >
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-[11px] font-semibold text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                {date}
              </span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            {msgs.map((m) => (
              <div
                key={m.id}
                className={`flex gap-1.5 mb-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}

                <div className={`flex flex-col max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                  {m.files && m.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {m.files.map((f, j) => (
                        <div key={j} className="flex items-center gap-1.5 px-2 py-1 bg-muted/60 rounded-lg text-xs">
                          {f.preview ? (
                            <img src={f.preview} alt={f.name} className="w-6 h-6 rounded object-cover" />
                          ) : (
                            <File className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="truncate max-w-[100px]">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border/50 text-card-foreground rounded-bl-sm shadow-sm"
                    }`}
                  >
                    {m.content}
                  </div>

                  {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                      {m.sources.slice(0, 4).map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          title={s.title}
                          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-muted/80 border border-border/50 text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <Globe className="w-3 h-3" />
                          {(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return "source"; } })()}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className={`flex items-center gap-1.5 mt-1 px-1 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                    <span className="text-[10px] text-muted-foreground">{formatTime(m.ts)}</span>
                    {m.role === "user" && (
                      <CheckCheck className="w-3.5 h-3.5 text-primary/80" />
                    )}
                  </div>
                </div>

                {m.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {user?.name ? (
                      <span className="text-xs font-bold text-foreground">{user.name.charAt(0).toUpperCase()}</span>
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {loading && (
          <div className="flex gap-1.5 justify-start mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shrink-0 mt-0.5 shadow-md">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-card border border-border/50 shadow-sm overflow-hidden">
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center py-2">
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2">{error}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* -- INPUT BAR -- */}
      <div className="shrink-0 border-t border-border/50 bg-background px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-2">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {attachedFiles.map((f, i) => (
              <FileChip key={i} file={f} onRemove={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (auditMode && attachedFiles.length > 0) {
              sendAudit();
            } else {
              send(input);
            }
          }}
          className="flex items-end gap-1.5"
        >
          <div className="flex gap-0.5 pb-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(",")}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Ajouter une piece jointe"
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                attachedFiles.length > 0
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Paperclip className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 relative bg-muted/60 border border-border/60 rounded-3xl flex items-end overflow-hidden focus-within:border-primary/40 focus-within:bg-background transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (auditMode && attachedFiles.length > 0) {
                    sendAudit();
                  } else {
                    send(input);
                  }
                }
              }}
              placeholder={auditMode ? "Contexte additionnel (optionnel)..." : "Message..."}
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[44px] max-h-[120px] leading-relaxed"
              disabled={loading}
            />
          </div>

          <div className="pb-0.5">
            {(input.trim() || (auditMode && attachedFiles.length > 0)) ? (
              <Button
                type="submit"
                size="icon"
                disabled={loading}
                className={`w-12 h-12 rounded-full shadow-lg transition-all ${
                  auditMode
                    ? "bg-destructive hover:bg-destructive/90"
                    : "bg-primary hover:bg-primary/90"
                }`}
              >
                {auditMode ? (
                  <Shield className="w-5 h-5 text-destructive-foreground" />
                ) : (
                  <Send className="w-5 h-5 text-primary-foreground" />
                )}
              </Button>
            ) : (
              <button
                type="button"
                title="Message vocal"
                className="w-12 h-12 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center shadow-lg transition-all"
              >
                <Mic className="w-5 h-5 text-primary-foreground" />
              </button>
            )}
          </div>
        </form>

        {(webSearch || auditMode) && (
          <div className="flex items-center gap-2 mt-2 ml-1 px-1">
            {webSearch && (
              <>
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] text-primary font-medium">Recherche web activee</span>
                <button onClick={() => setWebSearch(false)} className="text-[11px] text-muted-foreground underline ml-1">
                  desactiver
                </button>
              </>
            )}
            {auditMode && !webSearch && (
              <>
                <Shield className="w-3.5 h-3.5 text-destructive" />
                <span className="text-[11px] text-destructive font-medium">Mode Audit Red Team</span>
                <span className="text-[11px] text-muted-foreground">- depose tes fichiers</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* -- HISTORY DRAWER -- */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex md:absolute md:inset-auto md:right-0 md:top-0 md:h-full md:w-80"
          onClick={() => setShowHistory(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] md:hidden" />
          <div
            className="relative ml-auto w-full max-w-sm h-full bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 md:rounded-l-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-border/50 bg-muted/30">
              <button
                onClick={() => setShowHistory(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-foreground flex-1">Conversations</h2>
              <button
                onClick={newConversation}
                title="Nouvelle conversation"
                className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="px-3 py-2.5 border-b border-border/30">
              <div className="flex items-center gap-2.5 bg-muted/70 rounded-xl px-3.5 py-2.5">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {conversationsQuery.isLoading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!conversationsQuery.isLoading && filteredConvs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Aucune conversation</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Commence a discuter avec le Copilot</p>
                </div>
              )}
              {filteredConvs.map((c) => (
                <div
                  key={c.conversationId}
                  className={`group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-border/10 ${
                    c.conversationId === conversationId
                      ? "bg-primary/8"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => resumeConversation(c.conversationId)}
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 border border-border/40">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(c.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - {c.count} msg
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(c.conversationId); }}
                    title="Supprimer"
                    className="opacity-0 group-hover:opacity-100 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
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
