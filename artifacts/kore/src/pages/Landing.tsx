import { Link } from "wouter";

const features = [
  {
    tag: "Chief of Staff",
    title: "Clarté opérationnelle",
    desc: "Priorités, décisions, risques. Résumé quotidien généré localement. Red team intégré pour challenger chaque décision.",
  },
  {
    tag: "Memory Graph",
    title: "Mémoire structurée",
    desc: "Postgres + pgvector. Entités, relations, événements. Recherche sémantique locale — aucune donnée ne quitte votre instance.",
  },
  {
    tag: "Ops Watcher",
    title: "Vision sur vos systèmes",
    desc: "Lecture code, logs, builds, déploiements. Webhooks GitHub et Railway. Détection régression automatique.",
  },
  {
    tag: "Studio",
    title: "Création locale",
    desc: "Image via ComfyUI, transcription Whisper, musique MusicGen. Si l'URL locale est absente, message clair — jamais de fallback silencieux.",
  },
  {
    tag: "Action Hub",
    title: "Outils bornés",
    desc: "Catalogue déclaratif. Chaque tool passe par le policy engine. Approval humain obligatoire pour toute action sensible.",
  },
  {
    tag: "Audit",
    title: "Trace complète",
    desc: "Chaque prompt, décision, tool call et erreur sont journalisés. Journal immuable, lisible en un clic.",
  },
];

const principles = [
  ["Deny-by-default", "Aucune action sans capability explicite."],
  ["Local-first", "LLM, mémoire, médias — tout peut tourner sans cloud."],
  ["Auditable", "Chaque décision est traçable et réversible."],
  ["Zéro lock-in", "Bascule Ollama en une variable d'environnement."],
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <span className="text-[10px] font-bold text-primary-foreground">T</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">TAMS</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/security" className="hidden text-xs text-muted-foreground transition-colors hover:text-foreground sm:block">
              Sécurité
            </Link>
            <Link
              href="/auth"
              className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Se connecter
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-20 pt-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-muted-foreground">Deny-by-default · Audité · Local-first</span>
          </div>

          <h1 className="mb-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Un copilote personnel,{" "}
            <span className="text-muted-foreground">pas un chatbot.</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Capabilities explicites. Journal d'audit complet. Mémoire graphe
            locale. Studio média. Action Hub avec approvals humains.
            Chaque action est tracée, bornée, réversible.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth"
              className="w-full rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/security"
              className="w-full rounded-md border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:w-auto"
            >
              Voir la sécurité →
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-4 text-center">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Principes non négociables
            </h2>
          </div>
          <div className="mb-20 grid grid-cols-2 gap-px rounded-xl border border-border/50 bg-border/30 overflow-hidden lg:grid-cols-4">
            {principles.map(([title, desc]) => (
              <div key={title} className="bg-background px-5 py-5">
                <div className="mb-1 text-sm font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight">Modules</h2>
          </div>
          <div className="grid gap-px rounded-xl border border-border/50 bg-border/30 overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.tag}
                className="group bg-background p-6 transition-colors hover:bg-muted/20"
              >
                <div className="mb-3 inline-block rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {f.tag}
                </div>
                <h3 className="mb-2 text-sm font-medium">{f.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border/50 bg-muted/10">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">
              Ce qui n'est <span className="text-muted-foreground">pas</span> gratuit — honnêtement.
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              Vidéo générative locale de qualité exige un GPU. Sans GPU,
              pas d'alternative viable. Musique locale (MusicGen) tourne sur
              CPU mais lentement. Ces limitations sont affichées explicitement
              dans l'interface — jamais de fallback silencieux vers un service
              payant.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/80">
              <span className="text-[9px] font-bold text-primary-foreground">T</span>
            </div>
            <span className="text-xs text-muted-foreground">TAMS · AI Startup OS</span>
          </div>
          <span className="text-xs text-muted-foreground">Gratuit · Open source · Local-first</span>
        </div>
      </footer>
    </div>
  );
}
