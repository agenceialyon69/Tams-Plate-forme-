import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, Search, Filter, TrendingUp, AlertTriangle, ChevronRight,
  Phone, Mail, Linkedin, Globe, Calendar, Tag, Download, Star,
  Activity, ChevronDown, X, Edit3, Trash2, Zap, Clock, Target,
  BarChart3, CheckCircle2, Circle, ArrowRight, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

type Status = "new" | "contacted" | "nurturing" | "proposal" | "won" | "lost" | "paused";
type Priority = "high" | "medium" | "low";

interface Lead {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  website?: string | null;
  role?: string | null;
  industry?: string | null;
  source: string;
  status: Status;
  priority: Priority;
  score?: number | null;
  conversionProbability?: number | null;
  nextBestAction?: string | null;
  redTeamWarning?: string | null;
  scoredAt?: string | null;
  companySize?: string | null;
  budget?: string | null;
  decisionTimeline?: string | null;
  painPoints?: string | null;
  signals?: string | null;
  tags: string[];
  notes?: string | null;
  nextActionDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Activity {
  id: number;
  leadId: number;
  type: string;
  content: string;
  createdAt: string;
}

const STATUS_LABELS: Record<Status, string> = {
  new: "Nouveau", contacted: "Contacté", nurturing: "Nurturing",
  proposal: "Proposition", won: "Gagné", lost: "Perdu", paused: "En pause",
};
const STATUS_COLORS: Record<Status, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  contacted: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  nurturing: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  proposal: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  won: "bg-green-500/15 text-green-400 border-green-500/20",
  lost: "bg-red-500/15 text-red-400 border-red-500/20",
  paused: "bg-muted text-muted-foreground border-border",
};
const PRIORITY_COLORS: Record<Priority, string> = {
  high: "text-red-400",
  medium: "text-yellow-400",
  low: "text-muted-foreground",
};

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-border"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size < 40 ? 9 : 11} fontWeight="600"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  );
}

const EMPTY_FORM = {
  name: "", company: "", email: "", phone: "", linkedin: "", website: "",
  role: "", industry: "", source: "manual", status: "new" as Status,
  priority: "medium" as Priority, companySize: "", budget: "",
  decisionTimeline: "", painPoints: "", signals: "", notes: "", nextActionDate: "",
};

function AddLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: Lead) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const lead = await apiFetch("/api/leads", { method: "POST", body: JSON.stringify(form) });
      onCreated(lead);
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Nouveau lead</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
              <Input value={form.name} onChange={f("name")} placeholder="Jean Dupont" required className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Entreprise</label>
              <Input value={form.company} onChange={f("company")} placeholder="Acme Corp" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rôle</label>
              <Input value={form.role} onChange={f("role")} placeholder="CEO, DG…" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input value={form.email} onChange={f("email")} type="email" placeholder="jean@acme.com" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Téléphone</label>
              <Input value={form.phone} onChange={f("phone")} placeholder="+33 6…" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Secteur</label>
              <Input value={form.industry} onChange={f("industry")} placeholder="SaaS, Retail…" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Taille</label>
              <Input value={form.companySize} onChange={f("companySize")} placeholder="10-50, 500+" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Budget</label>
              <Input value={form.budget} onChange={f("budget")} placeholder="20k€/an, à confirmer" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Timeline décision</label>
              <Input value={form.decisionTimeline} onChange={f("decisionTimeline")} placeholder="Q3 2026, urgent…" className="h-9"/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Source</label>
              <select value={form.source} onChange={f("source")}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {["manual","linkedin","referral","inbound","event","cold","other"].map(s =>
                  <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">LinkedIn / Site</label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.linkedin} onChange={f("linkedin")} placeholder="linkedin.com/in/…" className="h-9"/>
                <Input value={form.website} onChange={f("website")} placeholder="acme.com" className="h-9"/>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Pain points</label>
              <Textarea value={form.painPoints} onChange={f("painPoints")} rows={2}
                placeholder="Problèmes qu'il cherche à résoudre…" className="resize-none text-sm"/>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Signaux / contexte</label>
              <Textarea value={form.signals} onChange={f("signals")} rows={2}
                placeholder="Levée de fonds, recrutement, changement de direction, article de presse…" className="resize-none text-sm"/>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Textarea value={form.notes} onChange={f("notes")} rows={3}
                placeholder="Contexte, historique de la relation…" className="resize-none text-sm"/>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 h-9" onClick={onClose}>Annuler</Button>
            <Button type="submit" className="flex-1 h-9" disabled={loading}>
              {loading ? "Ajout…" : "Ajouter le lead"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ActivityTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    note: <MessageSquare className="w-3 h-3"/>,
    call: <Phone className="w-3 h-3"/>,
    email: <Mail className="w-3 h-3"/>,
    meeting: <Calendar className="w-3 h-3"/>,
    linkedin: <Linkedin className="w-3 h-3"/>,
    status_change: <ArrowRight className="w-3 h-3"/>,
    score: <Star className="w-3 h-3"/>,
    next_action: <Target className="w-3 h-3"/>,
  };
  return <span className="text-muted-foreground">{icons[type] ?? <Circle className="w-3 h-3"/>}</span>;
}

function LeadDetail({ leadId, onClose, onUpdated, onDeleted }: {
  leadId: number;
  onClose: () => void;
  onUpdated: (l: Lead) => void;
  onDeleted: (id: number) => void;
}) {
  const [lead, setLead] = useState<(Lead & { activities: Activity[] }) | null>(null);
  const [scoring, setScoring] = useState(false);
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [addingActivity, setAddingActivity] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    const data = await apiFetch(`/api/leads/${leadId}`);
    setLead(data);
    setNotesVal(data.notes ?? "");
    setNextActionDate(data.nextActionDate ?? "");
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  async function runScore() {
    if (!lead) return;
    setScoring(true);
    try {
      const updated = await apiFetch(`/api/leads/${leadId}/score`, { method: "POST" });
      setLead(prev => prev ? { ...prev, ...updated } : prev);
      onUpdated(updated);
      toast({ title: "Score mis à jour", description: `${updated.score}/100` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally { setScoring(false); }
  }

  async function changeStatus(status: Status) {
    const updated = await apiFetch(`/api/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setLead(prev => prev ? { ...prev, ...updated } : prev);
    onUpdated(updated);
    await load();
  }

  async function saveNotes() {
    const updated = await apiFetch(`/api/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ notes: notesVal, nextActionDate }) });
    setLead(prev => prev ? { ...prev, ...updated } : prev);
    onUpdated(updated);
    setEditNotes(false);
    toast({ title: "Notes sauvegardées" });
  }

  async function logActivity() {
    if (!activityText.trim()) return;
    setAddingActivity(true);
    try {
      await apiFetch(`/api/leads/${leadId}/activities`, {
        method: "POST", body: JSON.stringify({ type: activityType, content: activityText }),
      });
      setActivityText("");
      await load();
    } finally { setAddingActivity(false); }
  }

  async function deleteLead() {
    if (!confirm("Supprimer ce lead définitivement ?")) return;
    await apiFetch(`/api/leads/${leadId}`, { method: "DELETE" });
    onDeleted(leadId);
    onClose();
  }

  if (!lead) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between p-5 border-b border-border gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-base truncate">{lead.name}</h2>
            {lead.score != null && <ScoreRing score={lead.score} size={36}/>}
          </div>
          {lead.company && <p className="text-sm text-muted-foreground mt-0.5">{lead.role ? `${lead.role} @ ` : ""}{lead.company}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[lead.status]}`}>
              {STATUS_LABELS[lead.status]}
            </span>
            {lead.industry && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{lead.industry}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={deleteLead} className="p-1.5 text-muted-foreground hover:text-red-400 rounded"><Trash2 className="w-4 h-4"/></button>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded"><X className="w-4 h-4"/></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Red Team warning */}
        {lead.redTeamWarning && (
          <div className="flex gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5"/>
            <p className="text-sm text-red-400">{lead.redTeamWarning}</p>
          </div>
        )}

        {/* Next best action */}
        {lead.nextBestAction && (
          <div className="flex gap-2.5 p-3 bg-accent/10 border border-accent/20 rounded-lg">
            <Zap className="w-4 h-4 text-accent shrink-0 mt-0.5"/>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Next best action</p>
              <p className="text-sm">{lead.nextBestAction}</p>
            </div>
          </div>
        )}

        {/* Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scoring IA</p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={runScore} disabled={scoring}>
              <Star className="w-3 h-3"/>
              {scoring ? "Analyse…" : lead.scoredAt ? "Re-scorer" : "Scorer maintenant"}
            </Button>
          </div>
          {lead.score != null ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Score global</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold">{lead.score}</span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Proba. conversion</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold">{lead.conversionProbability}</span>
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pas encore scoré — cliquez pour lancer l'analyse IA.</p>
          )}
        </div>

        {/* Status pipeline */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Pipeline</p>
          <div className="flex gap-1 flex-wrap">
            {(["new","contacted","nurturing","proposal","won","lost"] as Status[]).map(s => (
              <button key={s} onClick={() => changeStatus(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  lead.status === s ? STATUS_COLORS[s] : "border-border text-muted-foreground hover:border-accent/50"
                }`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Contact info */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Contact</p>
          <div className="space-y-1.5">
            {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm hover:text-accent transition-colors"><Mail className="w-3.5 h-3.5 text-muted-foreground"/>{lead.email}</a>}
            {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm hover:text-accent transition-colors"><Phone className="w-3.5 h-3.5 text-muted-foreground"/>{lead.phone}</a>}
            {lead.linkedin && <a href={lead.linkedin.startsWith("http") ? lead.linkedin : `https://${lead.linkedin}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:text-accent transition-colors"><Linkedin className="w-3.5 h-3.5 text-muted-foreground"/>{lead.linkedin}</a>}
            {lead.website && <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:text-accent transition-colors"><Globe className="w-3.5 h-3.5 text-muted-foreground"/>{lead.website}</a>}
          </div>
        </div>

        {/* Context */}
        {(lead.budget || lead.decisionTimeline || lead.companySize) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Contexte</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {lead.budget && <div className="bg-muted/30 rounded p-2"><span className="text-xs text-muted-foreground block">Budget</span>{lead.budget}</div>}
              {lead.decisionTimeline && <div className="bg-muted/30 rounded p-2"><span className="text-xs text-muted-foreground block">Timeline</span>{lead.decisionTimeline}</div>}
              {lead.companySize && <div className="bg-muted/30 rounded p-2"><span className="text-xs text-muted-foreground block">Taille</span>{lead.companySize}</div>}
              {lead.source && <div className="bg-muted/30 rounded p-2"><span className="text-xs text-muted-foreground block">Source</span>{lead.source}</div>}
            </div>
          </div>
        )}

        {/* Signals */}
        {lead.signals && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Signaux d'opportunité</p>
            <p className="text-sm bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">{lead.signals}</p>
          </div>
        )}

        {/* Pain points */}
        {lead.painPoints && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Pain points</p>
            <p className="text-sm bg-muted/30 rounded-lg p-3">{lead.painPoints}</p>
          </div>
        )}

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
            <button onClick={() => setEditNotes(p => !p)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Edit3 className="w-3 h-3"/>{editNotes ? "Annuler" : "Modifier"}
            </button>
          </div>
          {editNotes ? (
            <div className="space-y-2">
              <Textarea value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4} className="text-sm resize-none"/>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Prochaine action :</label>
                <Input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="h-7 text-xs flex-1"/>
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={saveNotes}>Sauvegarder</Button>
            </div>
          ) : (
            <>
              {lead.notes ? <p className="text-sm text-muted-foreground whitespace-pre-line">{lead.notes}</p>
                : <p className="text-sm text-muted-foreground/50">Aucune note…</p>}
              {lead.nextActionDate && (
                <p className="text-xs text-accent mt-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3"/>Prochaine action : {lead.nextActionDate}
                </p>
              )}
            </>
          )}
        </div>

        {/* Log activity */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ajouter une activité</p>
          <div className="flex gap-2 mb-2">
            {["note","call","email","meeting","linkedin"].map(t => (
              <button key={t} onClick={() => setActivityType(t)}
                className={`text-xs px-2 py-1 rounded border transition-all ${
                  activityType === t ? "border-accent text-accent" : "border-border text-muted-foreground hover:border-accent/50"
                }`}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea value={activityText} onChange={e => setActivityText(e.target.value)}
              placeholder="Résumé de l'échange, engagement pris…" rows={2}
              className="flex-1 text-sm resize-none" onKeyDown={e => { if (e.key === "Enter" && e.metaKey) logActivity(); }}/>
            <Button size="sm" disabled={!activityText.trim() || addingActivity} onClick={logActivity}
              className="self-end h-9">
              {addingActivity ? "…" : <Plus className="w-4 h-4"/>}
            </Button>
          </div>
        </div>

        {/* Timeline */}
        {lead.activities.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Historique</p>
            <div className="space-y-2">
              {[...lead.activities].reverse().map(act => (
                <div key={act.id} className="flex gap-2.5 text-sm">
                  <div className="flex flex-col items-center pt-0.5">
                    <ActivityTypeIcon type={act.type}/>
                    <div className="w-px flex-1 bg-border/50 mt-1"/>
                  </div>
                  <div className="pb-2 flex-1">
                    <p className="text-foreground/80 leading-snug">{act.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(act.createdAt).toLocaleDateString("fr-FR", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead, isSelected, onClick }: { lead: Lead; isSelected: boolean; onClick: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
        isSelected ? "border-accent bg-accent/5" : "border-border bg-card hover:border-border/80 hover:bg-muted/20"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{lead.name}</span>
            {lead.score != null && (
              <span className={`text-xs font-bold ${lead.score >= 70 ? "text-green-400" : lead.score >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                {lead.score}
              </span>
            )}
          </div>
          {lead.company && <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.role ? `${lead.role} @ ` : ""}{lead.company}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[lead.status]}`}>
              {STATUS_LABELS[lead.status]}
            </span>
            {lead.redTeamWarning && <AlertTriangle className="w-3 h-3 text-red-400"/>}
            {lead.nextActionDate && (
              <span className="text-[10px] text-accent flex items-center gap-0.5">
                <Calendar className="w-2.5 h-2.5"/>{lead.nextActionDate}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${isSelected ? "rotate-90" : ""}`}/>
      </div>
      {lead.nextBestAction && (
        <p className="text-[11px] text-muted-foreground mt-2 border-t border-border/40 pt-2 line-clamp-1">
          <span className="text-accent">→</span> {lead.nextBestAction}
        </p>
      )}
    </motion.button>
  );
}

export default function ProspectsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();

  const loadLeads = useCallback(async () => {
    try {
      const data = await apiFetch("/api/leads");
      setLeads(data);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filtered = leads.filter(l => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.role ?? "").toLowerCase().includes(q) ||
        (l.industry ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const activeLeads = leads.filter(l => !["won","lost"].includes(l.status));
  const highScore = leads.filter(l => (l.score ?? 0) >= 70);
  const withWarnings = leads.filter(l => l.redTeamWarning);
  const wonLeads = leads.filter(l => l.status === "won");

  function exportCSV() {
    const token = getToken();
    const url = `${API}/api/leads/export.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-tams.csv";
    // Add auth via hidden fetch
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "leads-tams.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel — list */}
      <div className={`flex flex-col ${selectedId ? "hidden md:flex md:w-[380px]" : "flex-1"} border-r border-border`}>
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-accent/25 to-accent/5 border border-accent/20 flex items-center justify-center shadow-sm shrink-0">
                <Users className="w-4 h-4 text-accent"/>
              </div>
              <div>
                <h1 className="font-serif font-semibold text-base leading-none text-foreground">Prospection</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{leads.length} leads</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={exportCSV} title="Export CSV">
                <Download className="w-3.5 h-3.5"/>
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowAdd(true)}>
                <Plus className="w-3.5 h-3.5"/>Ajouter
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "Actifs", value: activeLeads.length, color: "text-foreground" },
              { label: "Score ≥70", value: highScore.length, color: "text-green-400" },
              { label: "Alertes", value: withWarnings.length, color: "text-red-400" },
              { label: "Gagnés", value: wonLeads.length, color: "text-accent" },
            ].map(s => (
              <div key={s.label} className="bg-muted/30 rounded-lg p-2 text-center">
                <p className={`text-lg font-bold leading-none ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground"/>
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…" className="pl-8 h-8 text-sm"/>
          </div>

          {/* Status filter */}
          <div className="flex gap-1 flex-wrap">
            {(["all","new","contacted","nurturing","proposal","won","lost"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                  statusFilter === s
                    ? s === "all" ? "border-accent text-accent" : STATUS_COLORS[s as Status]
                    : "border-border text-muted-foreground hover:border-accent/30"
                }`}>
                {s === "all" ? "Tous" : STATUS_LABELS[s as Status]}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Users className="w-8 h-8 text-muted-foreground/30 mb-2"/>
              <p className="text-sm text-muted-foreground">
                {leads.length === 0 ? "Ajoutez votre premier lead" : "Aucun résultat"}
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.map(lead => (
                <LeadCard key={lead.id} lead={lead} isSelected={selectedId === lead.id}
                  onClick={() => setSelectedId(lead.id === selectedId ? null : lead.id)}/>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <AnimatePresence>
        {selectedId && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <LeadDetail
              leadId={selectedId}
              onClose={() => setSelectedId(null)}
              onUpdated={updated => setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))}
              onDeleted={id => { setLeads(prev => prev.filter(l => l.id !== id)); setSelectedId(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state when no detail */}
      {!selectedId && (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground/30">
          <div className="text-center">
            <Users className="w-12 h-12 mx-auto mb-3"/>
            <p className="text-sm">Sélectionnez un lead pour voir le détail</p>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddLeadModal
          onClose={() => setShowAdd(false)}
          onCreated={lead => { setLeads(prev => [lead, ...prev]); setSelectedId(lead.id); }}
        />
      )}
    </div>
  );
}
