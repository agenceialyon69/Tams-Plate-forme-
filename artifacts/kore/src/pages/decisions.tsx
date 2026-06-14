import { useState } from "react";
import { useCreateDecision, useListDecisions, getListDecisionsQueryKey, useGetDecision } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, ArrowRight, BrainCircuit, ShieldAlert, GitMerge, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Decisions() {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [selectedDecisionId, setSelectedDecisionId] = useState<number | null>(null);
  
  const { data: decisions, isLoading: isLoadingList } = useListDecisions();
  const { data: activeDecision, isLoading: isLoadingDecision } = useGetDecision(
    selectedDecisionId as number,
    { query: { enabled: !!selectedDecisionId } }
  );
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createDecision = useCreateDecision();

  const handleSubmit = async () => {
    if (!question.trim()) return;
    try {
      const res = await createDecision.mutateAsync({ data: { question, context } });
      setQuestion("");
      setContext("");
      queryClient.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
      setSelectedDecisionId(res.id);
      toast({ description: "Analyse en cours..." });
    } catch (e) {
      toast({ variant: "destructive", description: "Échec de la soumission." });
    }
  };

  return (
    <div className="p-8 md:p-12 max-w-6xl mx-auto flex flex-col md:flex-row gap-12 min-h-screen items-start">
      <div className="w-full md:w-1/3 space-y-8 sticky top-12">
        <header>
          <h1 className="text-3xl font-serif mb-2 text-foreground">Décisions</h1>
          <p className="text-muted-foreground">KORE vous aide à y voir clair.</p>
        </header>

        <Card className="bg-card border-card-border shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quelle est la décision à prendre ?</label>
              <Textarea 
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ex: Dois-je accepter cette offre d'emploi à Paris ?"
                className="bg-background border-border resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Contexte (optionnel)</label>
              <Textarea 
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Ex: Le salaire est meilleur, mais je perds en flexibilité..."
                className="bg-background border-border min-h-[100px] resize-none"
              />
            </div>
            <Button 
              onClick={handleSubmit} 
              disabled={!question.trim() || createDecision.isPending}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {createDecision.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Demander l'analyse de KORE"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Analyses récentes</h3>
          {isLoadingList ? (
            <div className="animate-pulse space-y-3">
              <div className="h-16 bg-card rounded-md" />
              <div className="h-16 bg-card rounded-md" />
            </div>
          ) : decisions?.length === 0 ? (
            <p className="text-muted-foreground italic text-sm">Aucune décision analysée.</p>
          ) : (
            decisions?.slice(0, 5).map(dec => (
              <button
                key={dec.id}
                onClick={() => setSelectedDecisionId(dec.id)}
                className={`w-full text-left p-4 rounded-md border transition-colors ${
                  selectedDecisionId === dec.id 
                    ? "bg-card border-accent" 
                    : "bg-background border-border hover:border-accent/50 hover:bg-card/50"
                }`}
              >
                <p className="font-medium text-foreground line-clamp-2 leading-tight text-sm mb-2">{dec.question}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(dec.createdAt), "d MMM", { locale: fr })}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="w-full md:w-2/3">
        <AnimatePresence mode="wait">
          {selectedDecisionId ? (
            <motion.div
              key={selectedDecisionId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {isLoadingDecision || createDecision.isPending ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <p className="text-muted-foreground animate-pulse">KORE réfléchit à la situation...</p>
                </div>
              ) : activeDecision ? (
                <div className="space-y-8">
                  <div className="border-b border-border pb-8">
                    <h2 className="text-2xl font-serif text-foreground mb-4 leading-snug">{activeDecision.question}</h2>
                    {activeDecision.context && (
                      <div className="bg-muted/50 p-4 rounded-md text-muted-foreground text-sm border-l-2 border-muted-foreground/30">
                        {activeDecision.context}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-6">
                    <Card className="bg-card border-card-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2 font-normal font-serif">
                          <BrainCircuit className="w-5 h-5 text-accent" />
                          Analyse neutre
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-foreground/90 whitespace-pre-wrap">{activeDecision.analysis}</p>
                      </CardContent>
                    </Card>

                    {activeDecision.priorityConflicts && (
                      <Card className="bg-card border-card-border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg flex items-center gap-2 font-normal font-serif">
                            <GitMerge className="w-5 h-5 text-destructive/80" />
                            Conflits de priorités
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-foreground/90 whitespace-pre-wrap">{activeDecision.priorityConflicts}</p>
                        </CardContent>
                      </Card>
                    )}

                    {activeDecision.blindSpots && (
                      <Card className="bg-card border-card-border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg flex items-center gap-2 font-normal font-serif">
                            <ShieldAlert className="w-5 h-5 text-orange-500/80" />
                            Angles morts
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-foreground/90 whitespace-pre-wrap">{activeDecision.blindSpots}</p>
                        </CardContent>
                      </Card>
                    )}

                    {activeDecision.alternatives && (
                      <Card className="bg-card border-card-border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg flex items-center gap-2 font-normal font-serif">
                            <ArrowRight className="w-5 h-5 text-blue-500/80" />
                            Alternatives
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-foreground/90 whitespace-pre-wrap">{activeDecision.alternatives}</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              ) : null}
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center py-32 border-2 border-dashed border-border rounded-xl">
              <div className="text-center space-y-3 max-w-sm px-6">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground text-lg">Sélectionnez ou soumettez une décision pour voir l'analyse de KORE.</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
