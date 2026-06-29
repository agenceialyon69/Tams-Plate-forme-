import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Filet de sécurité UI. Sans lui, la moindre erreur de rendu dans une page
 * (ex: Studio, génération vidéo) démonte tout React → ÉCRAN NOIR. Ici on
 * affiche un message clair + des actions de récupération, et le reste de
 * l'app (navigation) reste utilisable. Voir App.tsx (réinitialisé par route).
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Trace en console pour le diagnostic (jamais d'écran noir silencieux).
    console.error("[TAMS] Erreur de rendu interceptée:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-2xl">⚠️</div>
          <div className="text-lg font-semibold">Cette page a rencontré une erreur</div>
          <p className="text-sm text-muted-foreground max-w-md break-words">
            {this.state.error.message || "Erreur inattendue"}
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Réessayer
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium"
            >
              Accueil
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
