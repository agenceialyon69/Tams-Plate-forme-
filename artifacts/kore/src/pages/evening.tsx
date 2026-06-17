import { useState } from "react";
import {
  useSubmitEveningReview,
  getListEveningReviewsQueryKey,
  useListEveningReviews,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Loader2, MoonStar, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Evening() {
  const [mostImportantThing, setMostImportantThing] = useState("");
  const [energyLevel, setEnergyLevel] = useState(5);
  const [deferredItems, setDeferredItems] = useState("");
  const [abandonedItems, setAbandonedItems] = useState("");
  const [freeReflection, setFreeReflection] = useState("");
  const [showResponse, setShowResponse] = useState(false);
  const [tamsResponseText, setTamsResponseText] = useState("");

  const submitReview = useSubmitEveningReview();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pastReviews } = useListEveningReviews();
  const hasReviewedToday =
    pastReviews &&
    pastReviews.length > 0 &&
    new Date(pastReviews[0].reviewDate).toDateString() === new Date().toDateString();

  const handleSubmit = async () => {
    if (!mostImportantThing.trim()) return;
    try {
      const res = await submitReview.mutateAsync({
        data: {
          mostImportantThing,
          energyLevel,
          deferredItems: deferredItems || undefined,
          abandonedItems: abandonedItems || undefined,
          freeReflection: freeReflection || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListEveningReviewsQueryKey() });
      if (res.koreResponse) {
        setTamsResponseText(res.koreResponse);
        setShowResponse(true);
      } else {
        toast({ description: "Revue enregistrée. Reposez-vous." });
      }
    } catch {
      toast({ variant: "destructive", description: "Échec de l'enregistrement." });
    }
  };

  if (hasReviewedToday && !showResponse) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <MoonStar className="w-12 h-12 text-accent mx-auto opacity-50" />
          <h2 className="text-2xl font-serif text-foreground">Revue terminée</h2>
          <p className="text-muted-foreground text-lg">
            La journée est finie. Tu as fait de ton mieux. Déconnecte.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 max-w-3xl mx-auto min-h-screen">
      <AnimatePresence mode="wait">
        {!showResponse ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-12 pb-24"
          >
            <header className="text-center space-y-3 mb-12">
              <MoonStar className="w-8 h-8 text-accent mx-auto opacity-70" />
              <h1 className="text-4xl font-serif text-foreground">Revue du soir</h1>
              <p className="text-muted-foreground text-lg">Fermons la boucle de cette journée.</p>
            </header>

            <div className="space-y-10">
              <div className="space-y-4">
                <label className="text-xl font-serif text-foreground block">
                  Quelle a été la chose la plus importante aujourd'hui ?
                </label>
                <Textarea
                  value={mostImportantThing}
                  onChange={(e) => setMostImportantThing(e.target.value)}
                  className="bg-transparent border-b-2 border-x-0 border-t-0 border-border rounded-none focus-visible:ring-0 focus-visible:border-accent text-lg px-0 py-2 resize-none min-h-[60px]"
                  placeholder="..."
                  autoFocus
                />
              </div>

              <div className="space-y-6 bg-card/30 p-8 rounded-xl border border-card-border">
                <label className="text-lg font-serif text-foreground block text-center">
                  Niveau d'énergie global aujourd'hui ?
                </label>
                <div className="px-4">
                  <Slider
                    value={[energyLevel]}
                    onValueChange={(v) => setEnergyLevel(v[0])}
                    max={10}
                    min={1}
                    step={1}
                    className="py-4"
                  />
                  <div className="flex justify-between mt-2 text-sm text-muted-foreground font-mono">
                    <span>1 (Épuisé)</span>
                    <span className="text-accent font-bold text-lg">{energyLevel}</span>
                    <span>10 (Pleine forme)</span>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-foreground font-medium block">
                    Ce qui est reporté
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      (sans culpabilité)
                    </span>
                  </label>
                  <Textarea
                    value={deferredItems}
                    onChange={(e) => setDeferredItems(e.target.value)}
                    className="bg-card border-card-border min-h-[120px] resize-none"
                    placeholder="Pour demain ou plus tard..."
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-foreground font-medium block">
                    Ce qui est abandonné
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      (c'est ok)
                    </span>
                  </label>
                  <Textarea
                    value={abandonedItems}
                    onChange={(e) => setAbandonedItems(e.target.value)}
                    className="bg-card border-card-border min-h-[120px] resize-none"
                    placeholder="Ce que tu lâches vraiment..."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-foreground font-medium block">
                  Réflexion libre
                  <span className="text-muted-foreground font-normal text-sm ml-2">(optionnel)</span>
                </label>
                <Textarea
                  value={freeReflection}
                  onChange={(e) => setFreeReflection(e.target.value)}
                  className="bg-card border-card-border min-h-[120px] resize-none"
                  placeholder="Gratitude, frustrations, pensées..."
                />
              </div>

              <div className="flex justify-center pt-4">
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!mostImportantThing.trim() || submitReview.isPending}
                  className="bg-accent text-accent-foreground hover:bg-accent/90 px-12 h-14 rounded-full text-lg"
                >
                  {submitReview.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Clore la journée
                      <Send className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="response"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-[70vh] flex flex-col items-center justify-center space-y-8"
          >
            <MoonStar className="w-12 h-12 text-accent" />
            <div className="text-center space-y-6 max-w-2xl">
              <h2 className="text-2xl font-serif text-foreground">TAMS</h2>
              <div className="bg-card/50 border border-card-border p-8 rounded-2xl text-left">
                <p className="text-lg leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {tamsResponseText}
                </p>
              </div>
              <p className="text-muted-foreground mt-6">
                Tu peux maintenant fermer l'application. Bonne nuit.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
