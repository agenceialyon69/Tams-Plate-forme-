import { useQuery } from "@tanstack/react-query";
import AuthedLayout from "@/components/layout/AuthedLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Link } from "wouter";
import {
  ShieldCheck, Brain, Activity, Clapperboard, Inbox,
  MessageSquare, ArrowRight, Bot, Zap, Clock, BarChart3,
  Sparkles, ChevronRight, Cpu, GitBranch, FileText,
  Target, Users, Star,
} from "lucide-react";

// ─── Live stats ──────────────────────────────────────────────────────────────

async function fetchStats() {
  const [{ count: memCount }, { count: taskCount }, { count: decCount }, { count: runCount }] = await Promise.all([
    supabase.from("memory_nodes").select("id", { count: "exact", head: true }),
    supabase.from("cos_tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
    supabase.from("cos_decisions").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("ai_agent_runs").select("id", { count: "exact", head: true }),
  ]);
  return {
    memNodes: memCount ?? 0,
    openTasks: taskCount ?? 0,
    openDecisions: decCount ?? 0,
    agentRuns: runCount ?? 0,
  };
}

// ─── Modules list ────────────────────────────────────────────────────────────

const MODULES = [
  {
    tag: "Chat OS",
    icon: MessageSquare,
    emoji: "💬",
    title: "Chat OS",
    desc: "90% des actions TAMS depuis le chat. Agents, commandes, contexte mémoire.",
    href: "/chat",
    status: "live",
    color: "indigo",
  },
  {
    tag: "Agents",
    icon: Bot,
    emoji: "🤖",
    title: "Agent System",
    desc: "11 agents spécialisés : Executive, Engineering, Product, Red Team…",
    href: "/agents",
    status: "live",
    color: "violet",
  },
  {
    tag: "CoS",
    icon: Brain,
    emoji: "🧠",
    title: "Chief of Staff",
    desc: "Priorités, tâches, décisions, réunions, risques.",
    href: "/cos",
    status: "live",
    color: "blue",
  },
  {
    tag: "Memory",
    icon: GitBranch,
    emoji: "🗃️",
    title: "Memory Graph",
    desc: "Entités, relations, graphe de connaissances persistant.",
    href: "/memory",
    status: "live",
    color: "cyan",
  },
  {
    tag: "Ops",
    icon: Activity,
    emoji: "⚙️",
    title: "Ops Watcher",
    desc: "Monitors, alertes, runbooks automatisés.",
    href: "/ops",
    status: "live",
    color: "emerald",
  },
  {
    tag: "Studio",
    icon: Clapperboard,
    emoji: "🎨",
    title: "Studio Creative",
    desc: "Génération d'images Pollinations.ai, exports PDF.",
    href: "/studio",
    status: "live",
    color: "rose",
  },
  {
    tag: "Actions",
    icon: Inbox,
    emoji: "📥",
    title: "Action Hub",
    desc: "Approbations, actions sensibles, journal d'audit.",
    href: "/actions",
    status: "live",
    color: "amber",
  },
  {
    tag: "Security",
    icon: ShieldCheck,
    emoji: "🛡️",
    title: "Sécurité",
    desc: "Capabilities, policy engine, audit immuable.",
    href: "/security",
    status: "live",
    color: "slate",
  },
];

const COLOR_MAP: Record<string, string> = {
  indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  slate: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Nouvelle tâche", href: "/cos", icon: Target },
  { label: "Nouvelle décision", href: "/cos?tab=decisions", icon: FileText },
  { label: "Ajouter mémoire", href: "/memory", icon: Brain },
  { label: "Lancer un agent", href: "/agents", icon: Bot },
];

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, trend }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; trend?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/20 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-semibold leading-none mt-0.5">{value}</p>
        {trend && <p className="text-[10px] text-emerald-400 mt-0.5">{trend}</p>}
      </div>
    </div>
  );
}

// ─── Module card ─────────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: typeof MODULES[0] }) {
  const colorClass = COLOR_MAP[mod.color] ?? COLOR_MAP.slate;
  return (
    <Link href={mod.href}>
      <div className="group relative flex flex-col gap-3 rounded-xl border border-border/40 bg-card/10 p-4 transition-all hover:border-primary/30 hover:bg-card/30 cursor-pointer h-full">
        <div className="flex items-start justify-between">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg ${colorClass}`}>
            {mod.emoji}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400">live</span>
          </div>
        </div>
        <div>
          <h3 className="font-medium text-sm">{mod.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground/70 leading-relaxed">{mod.desc}</p>
        </div>
        <div className="mt-auto flex items-center gap-1 text-[11px] text-primary/50 group-hover:text-primary transition-colors">
          <span>Ouvrir</span>
          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchStats, refetchInterval: 30_000 });

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const dayName = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const s = stats.data;

  return (
    <AuthedLayout>
      <div className="mx-auto max-w-5xl space-y-8 p-6 pb-20">

        {/* Hero */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground/60 capitalize">{dayName}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {greeting}, {user?.email?.split("@")[0] ?? "CEO"} 👋
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Votre OS de direction — tout est opérationnel.</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-emerald-400">Tous systèmes actifs</span>
          </div>
        </div>

        {/* Live stats */}
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">Vue en temps réel</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Brain} label="Nœuds mémoire" value={s?.memNodes ?? "—"} />
            <StatCard icon={Target} label="Tâches ouvertes" value={s?.openTasks ?? "—"} />
            <StatCard icon={FileText} label="Décisions actives" value={s?.openDecisions ?? "—"} />
            <StatCard icon={Bot} label="Runs d'agents" value={s?.agentRuns ?? "—"} />
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">Actions rapides</h2>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(a => (
              <Link key={a.label} href={a.href}>
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/20 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/40 hover:text-foreground cursor-pointer">
                  <a.icon className="h-3.5 w-3.5" />
                  {a.label}
                </div>
              </Link>
            ))}
            <Link href="/chat">
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/10 cursor-pointer">
                <MessageSquare className="h-3.5 w-3.5" />
                Ouvrir le Chat OS
              </div>
            </Link>
          </div>
        </section>

        {/* Modules grid */}
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">Modules actifs</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(mod => (
              <ModuleCard key={mod.tag} mod={mod} />
            ))}
          </div>
        </section>

        {/* AI capabilities */}
        <section className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 to-violet-500/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Moteur IA actif</h2>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">100% gratuit</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-background/40 p-3">
              <div className="text-xs font-medium flex items-center gap-1.5 mb-1"><Cpu className="h-3 w-3 text-primary" />Pollinations.ai</div>
              <p className="text-[11px] text-muted-foreground">GPT-4o, Mistral, Qwen-Coder — streaming, CORS, zéro clé API</p>
            </div>
            <div className="rounded-lg bg-background/40 p-3">
              <div className="text-xs font-medium flex items-center gap-1.5 mb-1"><Bot className="h-3 w-3 text-violet-400" />11 Agents spécialisés</div>
              <p className="text-[11px] text-muted-foreground">Auto-routing par mots-clés, fallback automatique, logging Supabase</p>
            </div>
            <div className="rounded-lg bg-background/40 p-3">
              <div className="text-xs font-medium flex items-center gap-1.5 mb-1"><Star className="h-3 w-3 text-amber-400" />Images + PDF</div>
              <p className="text-[11px] text-muted-foreground">Génération d'images Pollinations, exports PDF via jsPDF en Studio</p>
            </div>
          </div>
        </section>

      </div>
    </AuthedLayout>
  );
}
