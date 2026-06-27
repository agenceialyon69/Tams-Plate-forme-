import AuthedLayout from "@/components/layout/AuthedLayout";
import { useAuth } from "@/hooks/useAuth";
import {
  ShieldCheck,
  Brain,
  Activity,
  Clapperboard,
  Inbox,
  MessageSquare,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Link } from "wouter";

const modules = [
  {
    tag: "Chief of Staff",
    icon: Brain,
    title: "Priorités & décisions",
    desc: "Résumé quotidien, risques ouverts, red team.",
    href: "#",
    status: "coming",
  },
  {
    tag: "Memory Graph",
    icon: Brain,
    title: "Mémoire structurée",
    desc: "Entités, relations, recherche sémantique locale.",
    href: "#",
    status: "coming",
  },
  {
    tag: "Ops Watcher",
    icon: Activity,
    title: "Ops & déploiements",
    desc: "GitHub, Railway, builds, alertes.",
    href: "#",
    status: "coming",
  },
  {
    tag: "Studio",
    icon: Clapperboard,
    title: "Création locale",
    desc: "ComfyUI · Whisper · MusicGen.",
    href: "#",
    status: "coming",
  },
  {
    tag: "Action Hub",
    icon: Inbox,
    title: "Tools bornés",
    desc: "Approvals humains pour toute action sensible.",
    href: "#",
    status: "coming",
  },
  {
    tag: "Chat",
    icon: MessageSquare,
    title: "Chat unifié",
    desc: "Orchestrateur avec attachments et tool calls.",
    href: "#",
    status: "coming",
  },
];

export default function Dashboard() {
  const { user } = useAuth();

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {user?.email?.split("@")[0] ?? "Dashboard"}
          </h1>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Accès rapide
            </h2>
          </div>
          <div className="grid gap-px rounded-xl border border-border/50 bg-border/30 overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
            <QuickCard
              icon={ShieldCheck}
              title="Sécurité"
              desc="Capabilities, approvals, journal d'audit."
              href="/security"
              live
            />
            {modules.map((m) => (
              <QuickCard
                key={m.tag}
                icon={m.icon}
                title={m.title}
                desc={m.desc}
                href={m.href}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border/50 bg-card/20 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Architecture</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ArchItem
              title="Deny-by-default"
              desc="Aucune action sans capability explicite. Le policy engine vérifie scope, resource et expiration."
            />
            <ArchItem
              title="Local-first"
              desc="LLM via Ollama, mémoire Postgres+pgvector, médias via ComfyUI/Whisper. Zero lock-in cloud."
            />
            <ArchItem
              title="Audit immuable"
              desc="Chaque prompt → décision → tool call → résultat est journalisé en Postgres avec RLS."
            />
            <ArchItem
              title="Intégrations à connecter"
              desc="GitHub · Railway · Ollama · ComfyUI · Whisper · MusicGen · n8n. Variables d'env documentées."
            />
          </div>
        </section>
      </div>
    </AuthedLayout>
  );
}

function QuickCard({
  icon: Icon,
  title,
  desc,
  href,
  live,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  href: string;
  live?: boolean;
}) {
  const inner = (
    <div className="group flex items-start gap-3 bg-background p-5 transition-colors hover:bg-muted/20">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              live
            </span>
          ) : (
            <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
              bientôt
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      {live && (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      )}
    </div>
  );

  if (live && href !== "#") {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

function ArchItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
    </div>
  );
}
