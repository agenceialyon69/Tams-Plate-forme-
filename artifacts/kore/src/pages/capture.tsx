import { useState, useRef } from "react";
import { useCreateCapture, useTranscribeAudio } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";

export default function Capture() {
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const createCapture = useCreateCapture();
  const transcribeAudio = useTranscribeAudio();

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
      setContent("");
      toast({ description: "Capture enregistrée. KORE a extrait les éléments." });
    } catch (error) {
      toast({ variant: "destructive", description: "Échec de la capture." });
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 md:p-12 min-h-screen flex flex-col justify-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 w-full">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-3xl font-serif text-foreground">Capture universelle</h1>
          <p className="text-muted-foreground">Parlez ou écrivez. KORE organisera le reste.</p>
        </div>

        <Card className="bg-card/50 border-card-border/50 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-0 relative">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Que voulez-vous vider de votre esprit ?"
              className="min-h-[200px] text-lg p-6 border-0 focus-visible:ring-0 resize-none bg-transparent placeholder:text-muted-foreground/50"
              disabled={isRecording || isTranscribing || createCapture.isPending}
            />
            
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <Button
                size="icon"
                variant={isRecording ? "destructive" : "secondary"}
                className={`rounded-full w-12 h-12 ${isRecording ? "animate-pulse shadow-[0_0_20px_rgba(255,0,0,0.5)]" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || createCapture.isPending}
              >
                {isRecording ? <Square className="w-5 h-5" fill="currentColor" /> : <Mic className="w-5 h-5" />}
              </Button>
              
              <Button
                size="icon"
                className="rounded-full w-12 h-12 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSubmit}
                disabled={!content.trim() || isRecording || isTranscribing || createCapture.isPending}
              >
                {createCapture.isPending || isTranscribing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 ml-1" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
