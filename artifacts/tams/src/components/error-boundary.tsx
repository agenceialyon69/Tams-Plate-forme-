import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Garde-fou global : empêche qu'une erreur de rendu d'une seule page fasse
 * planter TOUTE l'application (écran noir sans navigation). Affiche un message
 * clair + un bouton de rechargement, et logue l'erreur en console.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Visible dans la console du navigateur pour diagnostic.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-lg font-semibold text-foreground">Une erreur est survenue</div>
          <p className="max-w-md text-sm text-muted-foreground">
            Cette section a rencontré un problème. Le reste de l'application reste
            utilisable.
          </p>
          <pre className="max-w-full overflow-auto rounded-lg bg-secondary px-3 py-2 text-left text-[11px] text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg bg-secondary px-4 py-2 text-sm text-foreground hover:bg-accent"
            >
              Réessayer
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
