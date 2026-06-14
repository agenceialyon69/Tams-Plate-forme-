import { useState, useEffect, useRef } from "react";
import { useCreateCapture, useTranscribeAudio, getListCapturesQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Send, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createCapture = useCreateCapture();
  const transcribeAudio = useTranscribeAudio();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        setIsTranscribing(true);

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          try {
            const res = await transcribeAudio.mutateAsync({ data: { audioBase64: base64data, mimeType: 'audio/webm' } });
            setContent((prev) => (prev ? prev + " " + res.transcript : res.transcript));
            toast({ description: "Transcription terminée." });
          } catch (error) {
            toast({ variant: "destructive", description: "Échec de la transcription." });
          } finally {
            setIsTranscribing(false);
          }
        };
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      toast({ variant: "destructive", description: "Microphone inaccessible." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
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
      toast({ description: "Capture enregistrée avec succès." });
    } catch (error) {
      toast({ variant: "destructive", description: "Échec de la capture." });
    }
  };

  return (
    <>
      <Button
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 h-14 w-14 rounded-full shadow-lg z-50 bg-accent text-accent-foreground hover:bg-accent/90"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-card border-card-border">
          <DialogHeader>
            <DialogTitle className="font-serif">Capture rapide</DialogTitle>
            <DialogDescription>
              Videz votre esprit. KORE organisera le reste.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-4">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Saisissez votre pensée..."
              className="min-h-[150px] resize-none pb-14 bg-background/50 border-input"
              disabled={isRecording || isTranscribing || createCapture.isPending}
            />
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button
                size="icon"
                variant={isRecording ? "destructive" : "secondary"}
                className={`rounded-full h-8 w-8 ${isRecording ? "animate-pulse" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || createCapture.isPending}
              >
                {isRecording ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                className="rounded-full h-8 w-8 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSubmit}
                disabled={!content.trim() || isRecording || isTranscribing || createCapture.isPending}
              >
                {createCapture.isPending || isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
