import { useState, useRef } from "react";
import {
  useCreateCapture,
  useTranscribeAudio,
  useListCaptures,
  getListCapturesQueryKey,
  type Capture,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Send, Loader2, Clock, CheckCircle2, Calendar, BookOpen, Inbox } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const sourceConfig: Record<string, { label: string; icon: typeof Inbox; color: string }> = {
  text: { label: "Texte", icon: Inbox, color: "text-muted-foreground bg-muted border-border" },
  voice: { label: "Voix", icon: Mic, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
};

export default function Capture() {
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createCapture = useCreateCapture();
  const transcribeAudio = useTranscribeAudio();
  const { data: recentCaptures } = useListCaptures({ limit: 5 });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        setIsTranscribing(true);

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(",")[1];
          try {
            const res = await transcribeAudio.mutateAsync({
              data: { audioBase64: base64data, mimeType: "audio/webm" },
            });
            setContent((prev) => (prev ? prev + " " + res.transcript : res.transcript));
            toast({ description: "Transcription terminée." });
          } catch {
            toast({ variant: "destructive", description: "Échec de la transcription." });
          } finally {
            setIsTranscribing(false);
          }
        };
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch {
      toast({ variant: "destructive", description: "Microphone inaccessible." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    try {
      await createCapture.mutateAsync({ data: { content, source: "text" } });
      queryClient.invalidateQueries({ queryKey: getListCapturesQueryKey() });
      setContent("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
      toast({ description: "Capture enregistrée. TAMS a extrait les éléments." });
    } catch {
      toast({ variant: "destructive", description: "Échec de la capture." });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const busy = isRecording || isTranscribing || createCapture.isPending;

  return (
    <div className="max-w-3xl mx-auto p-8 md:p-12 space-y-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-serif text-foreground">Capture universelle</h1>
          <p className="text-muted-foreground">
            Tout ce qui prend de la place dans ta tête — tâches, idées, rendez-vous, inquiétudes.
            TAMS triera et organisera le reste.
          </p>
        </div>

        <Card className="bg-card/50 border-card-border/50 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-0 relative">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Que veux-tu vider de ton esprit ?"
              className="min-h-[200px] text-lg p-6 border-0 focus-visible:ring-0 resize-none bg-transparent placeholder:text-muted-foreground/40"
              disabled={busy}
              autoFocus
            />

            <div className="flex items-center justify-between px-4 pb-4">
              <p className="text-[10px] text-muted-foreground/40 font-mono">
                {content.length > 0 ? `${content.length} car. · ⌘↵ pour envoyer` : "⌘↵ pour envoyer"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant={isRecording ? "destructive" : "secondary"}
                  className={`rounded-full w-10 h-10 ${isRecording ? "animate-pulse shadow-[0_0_16px_rgba(255,0,0,0.4)]" : ""}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing || createCapture.isPending}
                  title={isRecording ? "Arrêter" : "Dicter"}
                >
                  {isRecording ? (
                    <Square className="w-4 h-4" fill="currentColor" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>

                <Button
                  size="icon"
                  className="rounded-full w-10 h-10 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={handleSubmit}
                  disabled={!content.trim() || busy}
                  title="Envoyer (⌘↵)"
                >
                  <AnimatePresence mode="wait">
                    {createCapture.isPending || isTranscribing ? (
                      <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </motion.div>
                    ) : submitted ? (
                      <motion.div
                        key="done"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </motion.div>
                    ) : (
                      <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Send className="w-4 h-4 ml-0.5" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {recentCaptures && recentCaptures.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Récemment capturé
          </h2>
          <div className="space-y-2">
            {recentCaptures.map((cap: Capture, i: number) => {
              const cfg = sourceConfig[cap.source] ?? sourceConfig.text;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={cap.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-card/40 border border-border/40 hover:bg-card/70 transition-colors"
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color.split(" ")[0]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground/80 line-clamp-2">{cap.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(cap.createdAt), "d MMM à HH:mm", { locale: fr })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 font-normal ${cfg.color}`}
                  >
                    {cfg.label}
                  </Badge>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
