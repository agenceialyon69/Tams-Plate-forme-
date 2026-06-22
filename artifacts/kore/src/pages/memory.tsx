import { useState } from "react";
import { useListMemory, useCreateMemoryEntry, useDeleteMemoryEntry, getListMemoryQueryKey, ListMemoryDomain, MemoryEntryInputDomain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, Plus, Trash2, Loader2, BrainCircuit } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";

export default function Memory() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({ title: "", content: "", domain: "personal", tags: "" });
  
  const { data: memories, isLoading } = useListMemory({ 
    domain: activeTab !== "all" ? activeTab as ListMemoryDomain : undefined,
    search: searchQuery || undefined
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMemory = useCreateMemoryEntry();
  const deleteMemory = useDeleteMemoryEntry();

  const handleCreate = async () => {
    if (!newEntry.title || !newEntry.content) return;
    
    try {
      await createMemory.mutateAsync({
        data: {
          title: newEntry.title,
          content: newEntry.content,
          domain: newEntry.domain as MemoryEntryInputDomain,
          tags: newEntry.tags.split(",").map(t => t.trim()).filter(Boolean)
        }
      });
      setIsAddOpen(false);
      setNewEntry({ title: "", content: "", domain: "personal", tags: "" });
      queryClient.invalidateQueries({ queryKey: getListMemoryQueryKey() });
      toast({ description: "Souvenir enregistré." });
    } catch (e) {
      toast({ variant: "destructive", description: "Échec de l'enregistrement." });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMemory.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListMemoryQueryKey() });
    } catch (e) {
      toast({ variant: "destructive", description: "Échec de la suppression." });
    }
  };

  const domains = [
    { value: "all", label: "Tout" },
    { value: "personal", label: "Personnel" },
    { value: "work", label: "Travail" },
    { value: "family", label: "Famille" },
    { value: "admin", label: "Administratif" },
    { value: "projects", label: "Projets" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <PageHeader
        icon={BrainCircuit}
        title="Mémoire"
        subtitle="Base de connaissances long terme de ton activité"
        className="mb-2"
        action={
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau
              </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-card-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif font-normal text-xl">Ajouter un souvenir</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Input 
                  placeholder="Titre" 
                  value={newEntry.title}
                  onChange={e => setNewEntry({...newEntry, title: e.target.value})}
                  className="bg-background/50 border-card-border"
                />
              </div>
              <div className="space-y-2">
                <Select value={newEntry.domain} onValueChange={v => setNewEntry({...newEntry, domain: v})}>
                  <SelectTrigger className="bg-background/50 border-card-border">
                    <SelectValue placeholder="Domaine" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.filter(d => d.value !== "all").map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Textarea 
                  placeholder="Contenu" 
                  value={newEntry.content}
                  onChange={e => setNewEntry({...newEntry, content: e.target.value})}
                  className="min-h-[150px] bg-background/50 border-card-border"
                />
              </div>
              <div className="space-y-2">
                <Input 
                  placeholder="Tags (séparés par des virgules)" 
                  value={newEntry.tags}
                  onChange={e => setNewEntry({...newEntry, tags: e.target.value})}
                  className="bg-background/50 border-card-border"
                />
              </div>
              <Button 
                onClick={handleCreate} 
                disabled={!newEntry.title || !newEntry.content || createMemory.isPending}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {createMemory.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
      />

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input 
          className="pl-10 h-12 bg-card/50 border-card-border text-lg focus-visible:ring-1 focus-visible:ring-accent" 
          placeholder="Rechercher dans votre mémoire..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none h-auto p-0 space-x-6">
          {domains.map(d => (
            <TabsTrigger 
              key={d.value} 
              value={d.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none py-3 px-1"
            >
              {d.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="bg-card border-card-border animate-pulse h-48" />
            ))
          ) : memories?.length === 0 ? (
            <div className="col-span-full text-center py-20 text-muted-foreground italic">
              Rien à afficher ici. La mémoire est vide.
            </div>
          ) : (
            memories?.map((mem, i) => (
              <motion.div
                key={mem.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="bg-card border-card-border h-full flex flex-col hover:border-border transition-colors group relative">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(mem.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start mb-1">
                      <Badge variant="outline" className="font-normal text-xs text-muted-foreground border-border bg-background/50">
                        {mem.domain}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(mem.createdAt), "d MMM yyyy", { locale: fr })}
                      </span>
                    </div>
                    <CardTitle className="font-serif font-normal text-xl leading-tight">{mem.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <p className="text-foreground/80 whitespace-pre-wrap flex-1 text-sm">{mem.content}</p>
                    {mem.tags && mem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                        {mem.tags.map(tag => (
                          <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </Tabs>
    </div>
  );
}
