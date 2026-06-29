import { useLocation } from "wouter";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 pb-28 md:pb-10">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Page introuvable</h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate("/")}
            className={cn(
              "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl",
              "bg-primary text-primary-foreground text-sm font-medium",
              "hover:opacity-90 active:scale-[0.98] transition-all"
            )}
          >
            <Home className="w-4 h-4" />
            Retour à l'accueil
          </button>
          <button
            onClick={() => window.history.back()}
            className={cn(
              "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl",
              "bg-secondary text-foreground text-sm font-medium",
              "hover:bg-accent active:scale-[0.98] transition-all"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Page précédente
          </button>
        </div>
      </div>
    </div>
  );
}
