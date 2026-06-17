import { useState, useEffect, useRef } from "react";
import {
  useCreateCapture,
  useTranscribeAudio,
  getListCapturesQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Send, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createCapture = useCreateCapture();
  const transcribeAudio = useTranscribeAudio();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

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
      setOpen(false);
      toast({ description: "Capture enregistrée. TAMS organisera le reste." });
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
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="fixed bottom-20 md:bottom-8 right-4 md:right-8 h-14 w-14 rounded-full shadow-lg z-50 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => setOpen(true)}
            aria-label="Capture rapide (⌘K)"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="hidden md:flex items-center gap-2">
          Capture rapide
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
            ⌘K
          </kbd>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-card border-card-border">
          <DialogHeader>
            <DialogTitle className="font-serif">Capture rapide</DialogTitle>
            <DialogDescription>
              Videz votre esprit. TAMS organisera le reste.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tâche, idée, rendez-vous, inquiétude... tout va ici."
              className="min-h-[150px] resize-none pb-14 bg-background/50 border-input"
              disabled={busy}
            />
            <div className="absolute bottom-3 left-3 text-[10px] text-muted-foreground/50 font-mono">
              {content.length > 0 && `${content.length} car.`}
            </div>
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button
                size="icon"
                variant={isRecording ? "destructive" : "secondary"}
                className={`rounded-full h-8 w-8 ${isRecording ? "animate-pulse" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || createCapture.isPending}
                title={isRecording ? "Arrêter l'enregistrement" : "Dicter un message"}
              >
                {isRecording ? (
                  <Square className="h-4 w-4" fill="currentColor" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                className="rounded-full h-8 w-8 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSubmit}
                disabled={!content.trim() || busy}
                title="Envoyer (⌘↵)"
              >
                {createCapture.isPending || isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/50 text-right -mt-1">⌘↵ pour envoyer</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
