import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Mic,
  Square,
  Pause,
  Play,
  ChevronRight,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  GitBranch,
  AlertCircle,
  FileText,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  Radio,
  Phone,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------- Types ----------

interface ActionItem {
  title: string;
  owner?: string;
  deadline?: string;
  priority: string;
}
interface Commitment {
  who: string;
  what: string;
  deadline?: string;
}
interface Decision {
  topic: string;
  decision: string;
  rationale?: string;
}
interface RecordingAnalysis {
  id: number;
  title: string;
  meetingType: string;
  durationSeconds: number | null;
  transcript: string | null;
  summary: string;
  actionItems: ActionItem[];
  commitments: Commitment[];
  decisions: Decision[];
  blindSpots: string;
  redTeamCritique: string;
  tamsMessage: string;
  createdAt: string;
}
interface RecordingSummary {
  id: number;
  title: string;
  meetingType: string;
  durationSeconds: number | null;
  tamsMessage: string | null;
  createdAt: string;
}

// ---------- Helpers ----------

const MEETING_TYPES = [
  { value: "meeting", label: "Réunion", icon: Radio, color: "text-blue-500" },
  { value: "call", label: "Appel", icon: Phone, color: "text-emerald-500" },
  { value: "brainstorm", label: "Brainstorm", icon: Lightbulb, color: "text-amber-500" },
  { value: "voice", label: "Mémo vocal", icon: MessageSquare, color: "text-purple-500" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const priorityColors: Record<string, string> = {
  high: "text-red-400 bg-red-400/10 border-red-400/20",
  medium: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  low: "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

// ---------- Waveform animation ----------

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-10">
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-accent"
          animate={
            active
              ? {
                  height: [8, Math.random() * 32 + 8, 8],
                  opacity: [0.5, 1, 0.5],
                }
              : { height: 4, opacity: 0.3 }
          }
          transition={
            active
              ? {
                  duration: 0.5 + Math.random() * 0.5,
                  repeat: Infinity,
                  delay: i * 0.06,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

// ---------- Main page ----------

type Phase = "setup" | "recording" | "processing" | "results" | "history";

export default function Recordings() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [inputMode, setInputMode] = useState<"record" | "text">("record");

  // Setup fields
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState("meeting");
  const [context, setContext] = useState("");
  const [pastedTranscript, setPastedTranscript] = useState("");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStep, setProcessingStep] = useState("");

  // Results
  const [analysis, setAnalysis] = useState<RecordingAnalysis | null>(null);
  const [history, setHistory] = useState<RecordingSummary[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    actions: true,
    commitments: false,
    decisions: false,
    blindSpots: false,
    redTeam: false,
    transcript: false,
  });

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const { toast } = useToast();

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const token = getToken();
      const res = await fetch("/api/recordings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setHistory(await res.json());
    } catch {}
    setLoadingHistory(false);
  }

  // Timer management
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - elapsedSeconds * 1000;
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }, [elapsedSeconds]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start recording
  async function startRecording() {
    if (!title.trim()) {
      toast({ variant: "destructive", description: "Donne un titre à cet enregistrement." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.start(1000); // chunk every 1s for reliability
      setIsRecording(true);
      setIsPaused(false);
      setElapsedSeconds(0);
      setPhase("recording");
      startTimer();
    } catch {
      toast({
        variant: "destructive",
        description:
          "Microphone inaccessible. Autorise l'accès dans les paramètres de ton navigateur.",
      });
    }
  }

  // Pause / Resume
  function togglePause() {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      startTimer();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      stopTimer();
      pausedAtRef.current = elapsedSeconds;
      setIsPaused(true);
    }
  }

  // Stop and analyze
  async function stopAndAnalyze() {
    if (!mediaRecorderRef.current) return;
    stopTimer();

    const duration = elapsedSeconds;
    setPhase("processing");
    setProcessingStep("Arrêt de l'enregistrement...");

    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      chunksRef.current = [];

      // Check size (~75MB base64 limit)
      if (blob.size > 55_000_000) {
        toast({
          variant: "destructive",
          description: "Enregistrement trop long. Maximum ~45 minutes.",
        });
        setPhase("setup");
        return;
      }

      setProcessingStep("Transcription en cours (Whisper)...");
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          setProcessingStep("Analyse Red Team par TAMS...");
          const token = getToken();
          const res = await fetch("/api/recordings/analyze", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: "audio/webm",
              title,
              context: context || null,
              meetingType,
              durationSeconds: duration,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
            throw new Error(err.error);
          }

          const data = await res.json();
          setAnalysis(data);
          setPhase("results");
          loadHistory();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Erreur inconnue";
          toast({ variant: "destructive", description: `Erreur : ${msg}` });
          setPhase("setup");
        }
      };
    };

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    setIsPaused(false);
  }

  // Cancel recording
  function cancelRecording() {
    stopTimer();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    chunksRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    setPhase("setup");
  }

  // Analyze pasted transcript
  async function analyzeText() {
    if (!title.trim() || !pastedTranscript.trim()) return;
    setPhase("processing");
    setProcessingStep("Analyse Red Team par TAMS...");
    try {
      const token = getToken();
      const res = await fetch("/api/recordings/analyze-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          transcript: pastedTranscript,
          title,
          context: context || null,
          meetingType,
          durationSeconds: null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erreur");
      const data = await res.json();
      setAnalysis(data);
      setPhase("results");
      loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ variant: "destructive", description: msg });
      setPhase("setup");
    }
  }

  // Load full recording from history
  async function loadRecording(id: number) {
    setSelectedHistoryId(id);
    try {
      const token = getToken();
      const res = await fetch(`/api/recordings/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
        setTitle(data.title);
        setMeetingType(data.meetingType);
        setPhase("results");
      }
    } catch {}
  }

  async function deleteRecording(id: number) {
    const token = getToken();
    await fetch(`/api/recordings/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    setHistory((h) => h.filter((r) => r.id !== id));
    if (analysis?.id === id) {
      setAnalysis(null);
      setPhase("setup");
    }
  }

  function toggleSection(key: string) {
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function resetSetup() {
    setAnalysis(null);
    setTitle("");
    setContext("");
    setPastedTranscript("");
    setElapsedSeconds(0);
    setPhase("setup");
    setSelectedHistoryId(null);
  }

  const selectedType = MEETING_TYPES.find((t) => t.value === meetingType)!;

  // ==================== RENDER ====================

  return (
    <div className="flex h-screen overflow-hidden">
      {/* History sidebar */}
      <aside className="hidden lg:flex flex-col w-72 border-r border-border/50 bg-card/30 shrink-0">
        <div className="p-5 border-b border-border/50">
          <h2 className="font-serif text-lg text-foreground">Enregistrements</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {history.length} enregistrement{history.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1">
          <button
            onClick={resetSetup}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-accent bg-accent/10 hover:bg-accent/15 transition-colors mb-3"
          >
            <Mic className="w-4 h-4" />
            Nouvel enregistrement
          </button>
          {loadingHistory ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Chargement...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm italic">
              Aucun enregistrement
            </div>
          ) : (
            history.map((rec) => {
              const TypeIcon = MEETING_TYPES.find((t) => t.value === rec.meetingType)?.icon ?? Radio;
              return (
                <div key={rec.id} className="group relative">
                  <button
                    onClick={() => loadRecording(rec.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedHistoryId === rec.id
                        ? "bg-card border-accent/50"
                        : "bg-transparent border-transparent hover:bg-card/60 hover:border-border/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <TypeIcon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">
                          {rec.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(rec.createdAt), "d MMM à HH:mm", { locale: fr })}
                          {rec.durationSeconds && ` · ${formatDuration(rec.durationSeconds)}`}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRecording(rec.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:text-destructive text-muted-foreground"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* ========== SETUP ========== */}
          {phase === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="max-w-2xl mx-auto px-6 py-10 space-y-8"
            >
              <div>
                <h1 className="text-3xl font-serif text-foreground mb-1">
                  Nouvel enregistrement
                </h1>
                <p className="text-muted-foreground">
                  Réunion, appel, brainstorm, mémo vocal — TAMS transcrit, analyse et extrait les
                  actions en mode Red Team.
                </p>
              </div>

              {/* Type selector */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MEETING_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setMeetingType(t.value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                        meetingType === t.value
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card/40 hover:border-accent/40"
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${t.color}`} />
                      <span className="text-xs font-medium text-foreground">{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Titre <span className="text-destructive">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Ex: Réunion équipe produit - ${format(new Date(), "d MMM", { locale: fr })}`}
                  autoFocus
                />
              </div>

              {/* Context */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  Contexte
                  <span className="text-muted-foreground font-normal text-xs">(optionnel)</span>
                </label>
                <Textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Objectif de la réunion, participants, enjeux particuliers..."
                  className="bg-card border-border resize-none min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  Un contexte riche améliore la précision de l'analyse Red Team.
                </p>
              </div>

              {/* Input mode toggle */}
              <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit">
                <button
                  onClick={() => setInputMode("record")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    inputMode === "record"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🎙 Enregistrer
                </button>
                <button
                  onClick={() => setInputMode("text")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    inputMode === "text"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📋 Coller une transcription
                </button>
              </div>

              {inputMode === "record" ? (
                <div className="space-y-4">
                  <div className="bg-card/40 border border-border/50 rounded-xl p-5 space-y-3">
                    <div className="flex items-start gap-3 text-sm text-muted-foreground">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                      <div className="space-y-1">
                        <p>
                          <strong className="text-foreground">Microphone uniquement</strong> — les
                          navigateurs ne peuvent pas capturer l'audio système des appels.
                        </p>
                        <p>
                          Pour les appels téléphoniques : active le haut-parleur et enregistre avec
                          TAMS ouvert. Pour les réunions visio : l'audio est capturé directement.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    onClick={startRecording}
                    disabled={!title.trim()}
                    className="w-full h-14 bg-accent text-accent-foreground hover:bg-accent/90 text-base rounded-xl"
                  >
                    <Mic className="w-5 h-5 mr-2" />
                    Démarrer l'enregistrement
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Textarea
                    value={pastedTranscript}
                    onChange={(e) => setPastedTranscript(e.target.value)}
                    placeholder="Colle ici la transcription de ta réunion ou de ton appel..."
                    className="bg-card border-border min-h-[200px] resize-none font-mono text-sm"
                  />
                  <Button
                    size="lg"
                    onClick={analyzeText}
                    disabled={!title.trim() || !pastedTranscript.trim()}
                    className="w-full h-14 bg-accent text-accent-foreground hover:bg-accent/90 text-base rounded-xl"
                  >
                    <ChevronRight className="w-5 h-5 mr-2" />
                    Analyser avec TAMS
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* ========== RECORDING ========== */}
          {phase === "recording" && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-screen p-8 text-center"
            >
              <div className="space-y-8 max-w-sm w-full">
                <div>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <selectedType.icon className={`w-4 h-4 ${selectedType.color}`} />
                    <span className="text-sm text-muted-foreground">{selectedType.label}</span>
                  </div>
                  <h2 className="text-xl font-serif text-foreground">{title}</h2>
                </div>

                {/* Waveform */}
                <div className="py-4">
                  <WaveformBars active={isRecording && !isPaused} />
                </div>

                {/* Timer */}
                <div className="space-y-1">
                  <p className="text-5xl font-mono font-light text-foreground tabular-nums">
                    {formatDuration(elapsedSeconds)}
                  </p>
                  {isPaused && (
                    <p className="text-sm text-amber-500 animate-pulse">En pause</p>
                  )}
                  {!isPaused && (
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm text-muted-foreground">Enregistrement en cours</span>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="icon"
                    variant="outline"
                    className="w-14 h-14 rounded-full"
                    onClick={togglePause}
                    title={isPaused ? "Reprendre" : "Pause"}
                  >
                    {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
                  </Button>

                  <Button
                    size="icon"
                    className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                    onClick={stopAndAnalyze}
                    title="Arrêter et analyser"
                  >
                    <Square className="w-8 h-8" fill="currentColor" />
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-14 h-14 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={cancelRecording}
                    title="Annuler"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Appuie sur ■ pour arrêter et lancer l'analyse Red Team
                  <br />
                  {elapsedSeconds > 2400 && (
                    <span className="text-amber-500">
                      ⚠️ Enregistrement long — pense à arrêter bientôt pour éviter les timeouts
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          )}

          {/* ========== PROCESSING ========== */}
          {phase === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-screen p-8 text-center"
            >
              <div className="space-y-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="w-12 h-12 text-accent mx-auto" />
                </motion.div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-serif text-foreground">TAMS analyse...</h2>
                  <p className="text-muted-foreground animate-pulse">{processingStep}</p>
                </div>
                <p className="text-xs text-muted-foreground/60 max-w-xs">
                  La transcription et l'analyse Red Team peuvent prendre 30 secondes à 2 minutes
                  selon la durée de l'enregistrement.
                </p>
              </div>
            </motion.div>
          )}

          {/* ========== RESULTS ========== */}
          {phase === "results" && analysis && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto px-6 py-8 space-y-6 pb-16"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <selectedType.icon className={`w-4 h-4 ${selectedType.color}`} />
                    <span className="text-xs text-muted-foreground capitalize">
                      {MEETING_TYPES.find((t) => t.value === analysis.meetingType)?.label}
                    </span>
                    {analysis.durationSeconds && (
                      <>
                        <span className="text-muted-foreground/30">·</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(analysis.durationSeconds)}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground/30">·</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(analysis.createdAt), "d MMM à HH:mm", { locale: fr })}
                    </span>
                  </div>
                  <h1 className="text-2xl font-serif text-foreground leading-tight">
                    {analysis.title}
                  </h1>
                </div>
                <Button variant="outline" size="sm" onClick={resetSetup} className="shrink-0">
                  + Nouveau
                </Button>
              </div>

              {/* TAMS message */}
              <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
                <p className="text-sm font-medium text-accent mb-2">TAMS</p>
                <p className="text-foreground/90 leading-relaxed">{analysis.tamsMessage}</p>
              </div>

              {/* Summary */}
              <Section
                title="Résumé"
                icon={<FileText className="w-4 h-4" />}
                expanded={expandedSections.summary}
                onToggle={() => toggleSection("summary")}
              >
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap text-sm">
                  {analysis.summary}
                </p>
              </Section>

              {/* Action items */}
              <Section
                title={`Actions à entreprendre`}
                count={analysis.actionItems.length}
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                expanded={expandedSections.actions}
                onToggle={() => toggleSection("actions")}
              >
                {analysis.actionItems.length === 0 ? (
                  <p className="text-muted-foreground italic text-sm">Aucune action identifiée.</p>
                ) : (
                  <ul className="space-y-3">
                    {analysis.actionItems.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/40"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-normal shrink-0 mt-0.5 ${priorityColors[item.priority] || priorityColors.medium}`}
                        >
                          {item.priority === "high" ? "Urgent" : item.priority === "low" ? "Faible" : "Normal"}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground/90 font-medium">{item.title}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                            {item.owner && (
                              <span className="text-xs text-muted-foreground">👤 {item.owner}</span>
                            )}
                            {item.deadline && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {item.deadline}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Commitments */}
              <Section
                title="Engagements pris"
                count={analysis.commitments.length}
                icon={<GitBranch className="w-4 h-4 text-blue-400" />}
                expanded={expandedSections.commitments}
                onToggle={() => toggleSection("commitments")}
              >
                {analysis.commitments.length === 0 ? (
                  <p className="text-muted-foreground italic text-sm">Aucun engagement identifié.</p>
                ) : (
                  <ul className="space-y-2">
                    {analysis.commitments.map((c, i) => (
                      <li
                        key={i}
                        className="flex gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10"
                      >
                        <span className="font-medium text-blue-400 text-sm shrink-0 min-w-[80px]">
                          {c.who}
                        </span>
                        <div>
                          <p className="text-sm text-foreground/90">{c.what}</p>
                          {c.deadline && (
                            <p className="text-xs text-muted-foreground mt-0.5">→ {c.deadline}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Decisions */}
              <Section
                title="Décisions prises"
                count={analysis.decisions.length}
                icon={<CheckCircle2 className="w-4 h-4 text-purple-400" />}
                expanded={expandedSections.decisions}
                onToggle={() => toggleSection("decisions")}
              >
                {analysis.decisions.length === 0 ? (
                  <p className="text-muted-foreground italic text-sm">Aucune décision identifiée.</p>
                ) : (
                  <ul className="space-y-3">
                    {analysis.decisions.map((d, i) => (
                      <li key={i} className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 space-y-1">
                        <p className="text-xs text-purple-400 font-medium uppercase tracking-wide">
                          {d.topic}
                        </p>
                        <p className="text-sm text-foreground/90">{d.decision}</p>
                        {d.rationale && (
                          <p className="text-xs text-muted-foreground italic">{d.rationale}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Blind spots */}
              <Section
                title="Angles morts"
                icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
                expanded={expandedSections.blindSpots}
                onToggle={() => toggleSection("blindSpots")}
              >
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap text-sm">
                  {analysis.blindSpots}
                </p>
              </Section>

              {/* Red Team critique */}
              <Section
                title="Critique Red Team"
                icon={<ShieldAlert className="w-4 h-4 text-red-500" />}
                expanded={expandedSections.redTeam}
                onToggle={() => toggleSection("redTeam")}
                accent="red"
              >
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap text-sm">
                  {analysis.redTeamCritique}
                </p>
              </Section>

              {/* Transcript */}
              {analysis.transcript && (
                <Section
                  title="Transcription complète"
                  icon={<FileText className="w-4 h-4 text-muted-foreground" />}
                  expanded={expandedSections.transcript}
                  onToggle={() => toggleSection("transcript")}
                >
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                    {analysis.transcript}
                  </pre>
                </Section>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ---------- Section accordion ----------

function Section({
  title,
  icon,
  count,
  expanded,
  onToggle,
  children,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: "red";
}) {
  return (
    <Card
      className={`border-card-border transition-colors ${
        accent === "red" ? "bg-red-500/5 border-red-500/20" : "bg-card"
      }`}
    >
      <CardHeader className="pb-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="flex items-center gap-2 font-serif font-normal text-lg">
            {icon}
            {title}
            {count !== undefined && (
              <span className="text-sm font-sans font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </CardTitle>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </CardHeader>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <CardContent className="pt-4">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
