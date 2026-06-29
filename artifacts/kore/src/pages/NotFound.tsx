import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-2 font-mono text-7xl font-bold text-muted-foreground/20">404</div>
      <h1 className="mb-2 text-xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Retour à l'accueil
      </Link>
    </div>
  );
}
