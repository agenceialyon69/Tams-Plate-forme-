import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, TrendingUp, Users, Target, Plus, Check, X,
  Droplets, BookOpen, Brain, Moon, Sun, Activity,
  Home, Car, UtensilsCrossed, ShoppingBag, Plane,
  ChevronRight, Trash2, Edit3, Sparkles, CalendarDays,
  Smile, Frown, Meh, Laugh, Annoyed
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────────────────── */

interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  days: boolean[]; // 7 days, starting Monday
  streak: number;
}

interface LifeGoal {
  id: string;
  domain: string;
  title: string;
  progress: number;
  deadline: string;
  subGoals: { id: string; label: string; done: boolean }[];
}

interface JournalEntry {
  id: string;
  date: string;
  mood: string;
  gratitude: string[];
  reflection: string;
}

interface FinanceData {
  income: number;
  expenses: number;
  savings: number;
  savingsGoal: number;
  categories: { name: string; amount: number; icon: string; color: string }[];
}

interface HealthData {
  score: number;
  lastActivity: string;
  sportGoal: string;
  sleepHours: number;
  sleepGoal: number;
}

interface FamilyEvent {
  id: string;
  title: string;
  date: string;
  type: "anniversary" | "event" | "time";
}

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────────────────────────────────────── */

const MOOD_EMOJIS: Record<string, { emoji: string; icon: typeof Smile; color: string; label: string }> = {
  happy:   { emoji: "😊", icon: Laugh,   color: "text-amber-400", label: "Heureux" },
  neutral: { emoji: "😐", icon: Meh,     color: "text-blue-400",  label: "Neutre" },
  sad:     { emoji: "😔", icon: Frown,   color: "text-slate-400", label: "Triste" },
  excited: { emoji: "🤩", icon: Sparkles,color: "text-violet-400",label: "Excité" },
  stressed:{ emoji: "😤", icon: Annoyed, color: "text-red-400",   label: "Stressé" },
};

const HABIT_ICONS: Record<string, typeof Droplets> = {
  water: Droplets,
  sport: Activity,
  read: BookOpen,
  meditate: Brain,
  sleep: Moon,
  sun: Sun,
};

const FINANCE_ICONS: Record<string, typeof Home> = {
  housing: Home,
  food: UtensilsCrossed,
  transport: Car,
  leisure: ShoppingBag,
  travel: Plane,
};

const DOMAIN_COLORS: Record<string, string> = {
  career: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  health: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  family: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  finance: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  learning: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const DOMAIN_LABELS: Record<string, string> = {
  career: "Carrière", health: "Santé", family: "Famille",
  finance: "Finances", learning: "Apprentissage",
};

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

/* ─────────────────────────────────────────────────────────────────────────────
   localStorage helpers
   ───────────────────────────────────────────────────────────────────────────── */

const LS_KEYS = {
  habits: "tams-life-habits",
  goals: "tams-life-goals",
  journal: "tams-life-journal",
  finances: "tams-life-finances",
  health: "tams-life-health",
  family: "tams-life-family",
  globalMood: "tams-life-mood",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ─────────────────────────────────────────────────────────────────────────────
   Default data
   ───────────────────────────────────────────────────────────────────────────── */

const defaultHabits: Habit[] = [
  { id: "h1", name: "Eau 2L", icon: "water", color: "bg-sky-500", days: [true,true,false,true,true,false,false], streak: 5 },
  { id: "h2", name: "Sport 30min", icon: "sport", color: "bg-emerald-500", days: [false,true,true,false,true,false,false], streak: 2 },
  { id: "h3", name: "Lecture", icon: "read", color: "bg-amber-500", days: [true,true,true,true,false,false,false], streak: 4 },
  { id: "h4", name: "Méditation", icon: "meditate", color: "bg-violet-500", days: [true,false,true,false,false,false,false], streak: 1 },
];

const defaultGoals: LifeGoal[] = [
  { id: "g1", domain: "health", title: "Courir un semi-marathon", progress: 35, deadline: "2025-09-15", subGoals: [
    { id: "sg1", label: "Courir 5km sans s'arrêter", done: true },
    { id: "sg2", label: "Courir 10km", done: true },
    { id: "sg3", label: "Courir 15km", done: false },
    { id: "sg4", label: "Courir 21km", done: false },
  ]},
  { id: "g2", domain: "finance", title: "Épargner 10 000€", progress: 62, deadline: "2025-12-31", subGoals: [
    { id: "sg5", label: "Épargner 2 500€", done: true },
    { id: "sg6", label: "Épargner 5 000€", done: true },
    { id: "sg7", label: "Épargner 7 500€", done: false },
    { id: "sg8", label: "Épargner 10 000€", done: false },
  ]},
  { id: "g3", domain: "learning", title: "Apprendre le piano", progress: 20, deadline: "2025-06-30", subGoals: [
    { id: "sg9", label: "Maîtriser les gammes", done: true },
    { id: "sg10", label: "Jouer un morceau complet", done: false },
  ]},
];

const defaultFinances: FinanceData = {
  income: 3200,
  expenses: 2450,
  savings: 750,
  savingsGoal: 10000,
  categories: [
    { name: "Logement", amount: 950, icon: "housing", color: "bg-blue-500" },
    { name: "Nourriture", amount: 520, icon: "food", color: "bg-emerald-500" },
    { name: "Transport", amount: 280, icon: "transport", color: "bg-amber-500" },
    { name: "Loisirs", amount: 450, icon: "leisure", color: "bg-violet-500" },
    { name: "Voyage", amount: 250, icon: "travel", color: "bg-rose-500" },
  ],
};

const defaultHealth: HealthData = {
  score: 78,
  lastActivity: "Course à pied · il y a 2j",
  sportGoal: "3/4 séances cette semaine",
  sleepHours: 6.5,
  sleepGoal: 7.5,
};

const defaultFamily: FamilyEvent[] = [
  { id: "f1", title: "Anniv. Sarah", date: "2025-03-15", type: "anniversary" },
  { id: "f2", title: "Dîner famille", date: "2025-02-28", type: "event" },
  { id: "f3", title: "Week-end ensemble", date: "2025-03-08", type: "time" },
];

const defaultJournal: JournalEntry[] = [
  { id: "j1", date: new Date().toISOString().split("T")[0], mood: "happy", gratitude: ["Le soleil", "Un bon café", "Appel avec maman"], reflection: "Bonne journée productive." },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────────────────────── */

export default function Vie() {
  const { toast } = useToast();

  // ── State ──
  const [habits, setHabits] = useState<Habit[]>(() => load(LS_KEYS.habits, defaultHabits));
  const [goals, setGoals] = useState<LifeGoal[]>(() => load(LS_KEYS.goals, defaultGoals));
  const [journal, setJournal] = useState<JournalEntry[]>(() => load(LS_KEYS.journal, defaultJournal));
  const [finances, setFinances] = useState<FinanceData>(() => load(LS_KEYS.finances, defaultFinances));
  const [health, setHealth] = useState<HealthData>(() => load(LS_KEYS.health, defaultHealth));
  const [family, setFamily] = useState<FamilyEvent[]>(() => load(LS_KEYS.family, defaultFamily));
  const [globalMood, setGlobalMood] = useState<string>(() => load(LS_KEYS.globalMood, "happy"));

  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitIcon, setNewHabitIcon] = useState("water");

  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDomain, setNewGoalDomain] = useState("health");

  const [showJournalEntry, setShowJournalEntry] = useState(false);
  const [journalMood, setJournalMood] = useState("happy");
  const [journalGratitude, setJournalGratitude] = useState(["", "", ""]);
  const [journalReflection, setJournalReflection] = useState("");

  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

  // ── Persist ──
  useEffect(() => save(LS_KEYS.habits, habits), [habits]);
  useEffect(() => save(LS_KEYS.goals, goals), [goals]);
  useEffect(() => save(LS_KEYS.journal, journal), [journal]);
  useEffect(() => save(LS_KEYS.finances, finances), [finances]);
  useEffect(() => save(LS_KEYS.health, health), [health]);
  useEffect(() => save(LS_KEYS.family, family), [family]);
  useEffect(() => save(LS_KEYS.globalMood, globalMood), [globalMood]);

  // ── Derived ──
  const todayEntry = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return journal.find(j => j.date === today);
  }, [journal]);

  const savingsProgress = useMemo(() => {
    return Math.min(100, Math.round((finances.savings / finances.savingsGoal) * 100));
  }, [finances.savings, finances.savingsGoal]);

  const healthProgress = useMemo(() => health.score, [health.score]);
  const sleepProgress = useMemo(() => Math.min(100, Math.round((health.sleepHours / health.sleepGoal) * 100)), [health]);

  // ── Handlers: Habits ──
  const toggleHabitDay = useCallback((habitId: string, dayIndex: number) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const newDays = [...h.days];
      newDays[dayIndex] = !newDays[dayIndex];
      // Recalculate streak
      let streak = 0;
      for (let i = newDays.length - 1; i >= 0; i--) {
        if (newDays[i]) streak++;
        else break;
      }
      return { ...h, days: newDays, streak };
    }));
  }, []);

  const addHabit = useCallback(() => {
    if (!newHabitName.trim()) return;
    const newHabit: Habit = {
      id: `h${Date.now()}`,
      name: newHabitName.trim(),
      icon: newHabitIcon,
      color: "bg-slate-500",
      days: [false, false, false, false, false, false, false],
      streak: 0,
    };
    setHabits(prev => [...prev, newHabit]);
    setNewHabitName("");
    setShowAddHabit(false);
    toast({ title: "Habitude ajoutée" });
  }, [newHabitName, newHabitIcon, toast]);

  const deleteHabit = useCallback((id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    toast({ title: "Habitude supprimée" });
  }, [toast]);

  // ── Handlers: Goals ──
  const toggleSubGoal = useCallback((goalId: string, subGoalId: string) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const newSubs = g.subGoals.map(sg => sg.id === subGoalId ? { ...sg, done: !sg.done } : sg);
      const progress = Math.round((newSubs.filter(sg => sg.done).length / newSubs.length) * 100);
      return { ...g, subGoals: newSubs, progress };
    }));
  }, []);

  const addGoal = useCallback(() => {
    if (!newGoalTitle.trim()) return;
    const newGoal: LifeGoal = {
      id: `g${Date.now()}`,
      domain: newGoalDomain,
      title: newGoalTitle.trim(),
      progress: 0,
      deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      subGoals: [],
    };
    setGoals(prev => [...prev, newGoal]);
    setNewGoalTitle("");
    setShowAddGoal(false);
    toast({ title: "Objectif ajouté" });
  }, [newGoalTitle, newGoalDomain, toast]);

  const deleteGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    toast({ title: "Objectif supprimé" });
  }, [toast]);

  // ── Handlers: Journal ──
  const saveJournalEntry = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const gratitude = journalGratitude.filter(g => g.trim());
    if (gratitude.length === 0 && !journalReflection.trim()) {
      toast({ title: "Remplis au moins un champ", variant: "destructive" });
      return;
    }
    const entry: JournalEntry = {
      id: `j${Date.now()}`,
      date: today,
      mood: journalMood,
      gratitude,
      reflection: journalReflection.trim(),
    };
    setJournal(prev => {
      const filtered = prev.filter(j => j.date !== today);
      return [entry, ...filtered];
    });
    setShowJournalEntry(false);
    setJournalGratitude(["", "", ""]);
    setJournalReflection("");
    setGlobalMood(journalMood);
    toast({ title: "Journal sauvegardé" });
  }, [journalMood, journalGratitude, journalReflection, toast]);

  // ── Helpers ──
  const daysUntil = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Demain";
    if (diff < 0) return `Il y a ${Math.abs(diff)}j`;
    return `Dans ${diff}j`;
  };

  const todayStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const currentMood = MOOD_EMOJIS[globalMood] ?? MOOD_EMOJIS.happy;

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-28 md:pb-10 space-y-6 stagger-up">

        {/* ═══════════════════════════════════════════════════════════════════
            HEADER
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="flex items-start justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Ma Vie</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{todayStr}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowJournalEntry(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-xs font-medium transition-all active:scale-[0.98] min-h-[44px] min-w-[44px]"
              aria-label="Journal du jour"
            >
              <currentMood.icon className={cn("w-4 h-4", currentMood.color)} />
              <span className="hidden sm:inline">{currentMood.label}</span>
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-sky-400 flex items-center justify-center text-sm font-bold text-white shadow-sm">
              M
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            DASHBOARD 2x2
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3 animate-fade-in stagger-up" style={{ animationDelay: ".03s" }}>
          {/* Santé */}
          <div className="bg-card border border-card-border rounded-xl p-3.5 hover:border-border/80 transition-all duration-300 hover-lift hover-glow">
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs font-medium text-foreground">Santé</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{healthProgress}</div>
            <div className="text-[10px] text-muted-foreground mb-2">/100 score</div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${healthProgress}%` }} />
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] text-muted-foreground truncate">{health.lastActivity}</div>
              <div className="text-[10px] text-emerald-400">{health.sportGoal}</div>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Moon className="w-3 h-3 text-sky-400" />
              <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${sleepProgress}%` }} />
              </div>
              <span className="text-[9px] text-muted-foreground">{health.sleepHours}h</span>
            </div>
          </div>

          {/* Finances */}
          <div className="bg-card border border-card-border rounded-xl p-3.5 hover:border-border/80 transition-all duration-300 hover-lift hover-glow">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-foreground">Finances</span>
            </div>
            <div className="flex items-baseline gap-1">
              <div className="text-lg font-bold text-foreground">{finances.savings.toLocaleString()}€</div>
              <div className="text-[10px] text-muted-foreground">épargne</div>
            </div>
            <div className="text-[10px] text-muted-foreground mb-2">sur {finances.savingsGoal.toLocaleString()}€</div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${savingsProgress}%` }} />
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-emerald-400">+{finances.income.toLocaleString()}€</span>
              <span className="text-rose-400">-{finances.expenses.toLocaleString()}€</span>
            </div>
          </div>

          {/* Famille */}
          <div className="bg-card border border-card-border rounded-xl p-3.5 hover:border-border/80 transition-all duration-300 hover-lift hover-glow">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-foreground">Famille</span>
            </div>
            <div className="space-y-1.5">
              {family.slice(0, 3).map(ev => (
                <div key={ev.id} className="flex items-center gap-1.5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    ev.type === "anniversary" ? "bg-rose-400" : ev.type === "event" ? "bg-amber-400" : "bg-sky-400"
                  )} />
                  <span className="text-[11px] text-foreground truncate flex-1">{ev.title}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{daysUntil(ev.date)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Objectifs de vie */}
          <div className="bg-card border border-card-border rounded-xl p-3.5 hover:border-border/80 transition-all duration-300 hover-lift hover-glow">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-medium text-foreground">Objectifs</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{goals.length}</div>
            <div className="text-[10px] text-muted-foreground mb-2">actifs</div>
            <div className="space-y-1">
              {goals.slice(0, 2).map(g => (
                <div key={g.id}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-foreground truncate">{g.title}</span>
                    <span className="text-muted-foreground shrink-0">{g.progress}%</span>
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", g.domain === "health" ? "bg-emerald-500" : g.domain === "finance" ? "bg-violet-500" : "bg-sky-500")} style={{ width: `${g.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            HABITUDES
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="animate-fade-in" style={{ animationDelay: ".06s" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Habitudes</span>
            </div>
            <button
              onClick={() => setShowAddHabit(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-[10px] font-medium transition-all duration-300 active:scale-[0.98] min-h-[36px] hover-lift ripple-btn"
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden transition-all duration-300 hover-glow">
            {/* Header jours */}
            <div className="grid grid-cols-[1fr_repeat(7,2rem)] gap-1 px-3 py-2 border-b border-card-border items-center">
              <span className="text-[10px] font-medium text-muted-foreground">Habitude</span>
              {DAY_LABELS.map((d, i) => (
                <span key={i} className={cn(
                  "text-[10px] text-center font-medium",
                  i === new Date().getDay() - 1 || (i === 6 && new Date().getDay() === 0) ? "text-primary" : "text-muted-foreground"
                )}>
                  {d}
                </span>
              ))}
            </div>

            {/* Lignes d'habitudes */}
            <div className="divide-y divide-border">
              {habits.map(habit => {
                const Icon = HABIT_ICONS[habit.icon] ?? Droplets;
                return (
                  <div key={habit.id} className="grid grid-cols-[1fr_repeat(7,2rem)] gap-1 px-3 py-2 items-center hover:bg-accent/30 transition-all duration-300 hover-lift">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-foreground truncate">{habit.name}</span>
                      {habit.streak > 0 && (
                        <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded-full shrink-0">
                          🔥 {habit.streak}
                        </span>
                      )}
                    </div>
                    {habit.days.map((done, i) => (
                      <button
                        key={i}
                        onClick={() => toggleHabitDay(habit.id, i)}
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90 mx-auto",
                          done
                            ? `${habit.color} text-white shadow-sm`
                            : "bg-secondary hover:bg-accent text-muted-foreground"
                        )}
                        aria-label={`${habit.name} - ${DAY_LABELS[i]} ${done ? "fait" : "non fait"}`}
                      >
                        {done && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add habit form */}
          {showAddHabit && (
            <div className="mt-2 bg-card border border-card-border rounded-xl p-3 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={newHabitName}
                  onChange={e => setNewHabitName(e.target.value)}
                  placeholder="Nom de l'habitude..."
                  className="flex-1 bg-secondary rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-muted-foreground">Icône :</span>
                {Object.entries(HABIT_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setNewHabitIcon(key)}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                      newHabitIcon === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addHabit}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-medium transition-all active:scale-[0.98] min-h-[44px]"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowAddHabit(false); setNewHabitName(""); }}
                  className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs transition-all active:scale-[0.98] min-h-[44px]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            OBJECTIFS
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="animate-fade-in" style={{ animationDelay: ".09s" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Objectifs de vie</span>
            </div>
            <button
              onClick={() => setShowAddGoal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-[10px] font-medium transition-all duration-300 active:scale-[0.98] min-h-[36px] hover-lift ripple-btn"
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>

          <div className="space-y-2 stagger-up">
            {goals.map(goal => (
              <div key={goal.id} className="bg-card border border-card-border rounded-xl overflow-hidden hover:border-border/80 transition-all duration-300 hover-lift hover-glow">
                <button
                  onClick={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left"
                >
                  <div className={cn("px-2 py-0.5 rounded-full text-[9px] font-medium border shrink-0", DOMAIN_COLORS[goal.domain] || DOMAIN_COLORS.career)}>
                    {DOMAIN_LABELS[goal.domain] || goal.domain}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{goal.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-500 animate-glow-pulse", goal.domain === "health" ? "bg-emerald-500" : goal.domain === "finance" ? "bg-violet-500" : goal.domain === "learning" ? "bg-cyan-500" : "bg-blue-500")} style={{ width: `${goal.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{goal.progress}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{daysUntil(goal.deadline)}</span>
                    <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", expandedGoal === goal.id && "rotate-90")} />
                  </div>
                </button>

                {expandedGoal === goal.id && (
                  <div className="px-3 pb-3 animate-fade-in">
                    <div className="space-y-1.5 mb-2">
                      {goal.subGoals.map(sg => (
                        <button
                          key={sg.id}
                          onClick={() => toggleSubGoal(goal.id, sg.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors text-left"
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                            sg.done ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/30"
                          )}>
                            {sg.done && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className={cn("text-xs", sg.done && "line-through text-muted-foreground")}>{sg.label}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors px-2 py-1"
                    >
                      <Trash2 className="w-3 h-3" /> Supprimer
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {showAddGoal && (
            <div className="mt-2 bg-card border border-card-border rounded-xl p-3 animate-fade-in">
              <input
                value={newGoalTitle}
                onChange={e => setNewGoalTitle(e.target.value)}
                placeholder="Titre de l'objectif..."
                className="w-full bg-secondary rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring min-h-[44px] mb-2"
              />
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Domaine :</span>
                {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setNewGoalDomain(key)}
                    className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-medium border transition-all duration-300 hover:scale-105",
                      newGoalDomain === key ? DOMAIN_COLORS[key] : "bg-secondary text-muted-foreground border-transparent"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addGoal}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-medium transition-all active:scale-[0.98] min-h-[44px]"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowAddGoal(false); setNewGoalTitle(""); }}
                  className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs transition-all active:scale-[0.98] min-h-[44px]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            JOURNAL
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="animate-fade-in" style={{ animationDelay: ".12s" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-medium text-foreground uppercase tracking-wider">Journal</span>
            </div>
            <button
              onClick={() => setShowJournalEntry(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-accent text-secondary-foreground text-[10px] font-medium transition-all active:scale-[0.98] min-h-[36px]"
            >
              <Edit3 className="w-3 h-3" /> Écrire
            </button>
          </div>

          {/* Today's entry summary */}
          {todayEntry ? (
            <div className="bg-card border border-card-border rounded-xl p-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{MOOD_EMOJIS[todayEntry.mood]?.emoji ?? "😊"}</span>
                <div>
                  <div className="text-sm font-medium text-foreground">Aujourd'hui</div>
                  <div className="text-[10px] text-muted-foreground">{MOOD_EMOJIS[todayEntry.mood]?.label ?? "Heureux"}</div>
                </div>
              </div>
              {todayEntry.gratitude.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gratitude</div>
                  <div className="space-y-1">
                    {todayEntry.gratitude.map((g, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span className="text-xs text-foreground">{g}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {todayEntry.reflection && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Réflexion</div>
                  <p className="text-xs text-foreground leading-relaxed">{todayEntry.reflection}</p>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowJournalEntry(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-6 rounded-xl bg-card border border-dashed border-card-border hover:border-border/80 transition-all active:scale-[0.98]"
            >
              <PenIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Écrire dans le journal aujourd'hui</span>
            </button>
          )}

          {/* Previous entries */}
          {journal.filter(j => j.date !== new Date().toISOString().split("T")[0]).length > 0 && (
            <div className="mt-2 space-y-1">
              {journal.filter(j => j.date !== new Date().toISOString().split("T")[0]).slice(0, 3).map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                  <span className="text-lg">{MOOD_EMOJIS[entry.mood]?.emoji ?? "😊"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate">
                      {entry.gratitude[0] || entry.reflection || "Entrée journalière"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{new Date(entry.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            FINANCES SIMPLIFIÉES
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="animate-fade-in" style={{ animationDelay: ".15s" }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-foreground uppercase tracking-wider">Finances</span>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-4">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-400">+{finances.income.toLocaleString()}€</div>
                <div className="text-[10px] text-muted-foreground">Revenus</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-rose-400">-{finances.expenses.toLocaleString()}€</div>
                <div className="text-[10px] text-muted-foreground">Dépenses</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-sky-400">{finances.savings.toLocaleString()}€</div>
                <div className="text-[10px] text-muted-foreground">Épargne</div>
              </div>
            </div>

            {/* Savings goal */}
            <div className="mb-4">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-foreground">Objectif d'épargne</span>
                <span className="text-muted-foreground">{savingsProgress}% · {finances.savings.toLocaleString()} / {finances.savingsGoal.toLocaleString()}€</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-sky-400 rounded-full transition-all" style={{ width: `${savingsProgress}%` }} />
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-2">
              {finances.categories.map(cat => {
                const pct = Math.round((cat.amount / finances.expenses) * 100);
                const Icon = FINANCE_ICONS[cat.icon] ?? Home;
                return (
                  <div key={cat.name} className="flex items-center gap-2">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", cat.color.replace("bg-", "bg-").replace("500", "500/10"))}>
                      <Icon className={cn("w-3.5 h-3.5", cat.color.replace("bg-", "text-"))} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-foreground">{cat.name}</span>
                        <span className="text-muted-foreground">{cat.amount}€ ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", cat.color)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Journal Entry
          ═══════════════════════════════════════════════════════════════════════ */}
      {showJournalEntry && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-background w-full max-w-md md:rounded-2xl rounded-t-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Journal du jour</h3>
              <button onClick={() => setShowJournalEntry(false)} className="p-2 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mood picker */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Humeur</label>
              <div className="flex gap-2">
                {Object.entries(MOOD_EMOJIS).map(([key, { emoji, label }]) => (
                  <button
                    key={key}
                    onClick={() => setJournalMood(key)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-[0.98] min-h-[44px]",
                      journalMood === key ? "bg-primary/10 border border-primary/30" : "bg-secondary hover:bg-accent"
                    )}
                  >
                    <span className="text-xl">{emoji}</span>
                    <span className="text-[9px] text-muted-foreground">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Gratitude */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Gratitude (3 choses)</label>
              <div className="space-y-2">
                {journalGratitude.map((g, i) => (
                  <input
                    key={i}
                    value={g}
                    onChange={e => {
                      const next = [...journalGratitude];
                      next[i] = e.target.value;
                      setJournalGratitude(next);
                    }}
                    placeholder={`Chose #${i + 1}`}
                    className="w-full bg-secondary rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                  />
                ))}
              </div>
            </div>

            {/* Reflection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Réflexion du soir</label>
              <textarea
                value={journalReflection}
                onChange={e => setJournalReflection(e.target.value)}
                placeholder="Qu'est-ce qui a bien marché aujourd'hui ?"
                rows={3}
                className="w-full bg-secondary rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <button
              onClick={saveJournalEntry}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-medium transition-all active:scale-[0.98] min-h-[44px]"
            >
              Sauvegarder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-component for pen icon (not in lucide directly as Pen) ─── */
function PenIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
