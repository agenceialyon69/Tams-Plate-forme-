import type { ComponentType } from "react";
import {
  Bot,
  Brain,
  Briefcase,
  Camera,
  CheckSquare,
  Code2,
  Cpu,
  Film,
  Home,
  Layers,
  ListChecks,
  MessageSquare,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  aliases?: string[];
  required?: boolean;
};

export type ShellNavGroup = {
  label: string;
  items: ShellNavItem[];
};

export const shellNavGroups: ShellNavGroup[] = [
  {
    label: "Cockpit",
    items: [
      { href: "/today", label: "Aujourd'hui", icon: Home, aliases: ["/"], required: true },
      { href: "/chat", label: "Agent Chat", icon: MessageSquare, required: true },
      { href: "/capture", label: "Capture rapide", icon: Camera, required: true },
    ],
  },
  {
    label: "Vie",
    items: [
      { href: "/dossiers", label: "Dossiers & Tâches", icon: Briefcase, aliases: ["/travail"], required: true },
      { href: "/memory", label: "Mémoire & Décisions", icon: Brain, aliases: ["/systeme"], required: true },
      { href: "/missions", label: "Missions", icon: Target, required: true },
    ],
  },
  {
    label: "Contrôle",
    items: [
      { href: "/approvals", label: "Approbations", icon: ShieldCheck, required: true },
      { href: "/system", label: "Système & Audit", icon: Cpu, aliases: ["/systeme"], required: true },
    ],
  },
  {
    label: "Outils existants",
    items: [
      { href: "/studio", label: "Studio", icon: Film },
      { href: "/capabilities", label: "Capacités", icon: ListChecks },
      { href: "/mon-agent", label: "Mon Agent", icon: Bot },
      { href: "/dev-agent-pro", label: "Dev Agent Pro", icon: Code2 },
    ],
  },
  {
    label: "Compte",
    items: [
      { href: "/settings", label: "Paramètres", icon: Settings, required: true },
    ],
  },
];

export const mobilePrimaryItems: ShellNavItem[] = [
  { href: "/today", label: "Aujourd'hui", icon: Home, aliases: ["/"] },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/dossiers", label: "Dossiers", icon: Briefcase, aliases: ["/travail"] },
  { href: "/missions", label: "Missions", icon: Target },
  { href: "/approvals", label: "Approb.", icon: CheckSquare },
];

export const menuIcon = Layers;

export function isShellRouteActive(location: string, item: ShellNavItem): boolean {
  const candidates = [item.href, ...(item.aliases ?? [])];
  return candidates.some((href) => {
    if (href === "/") return location === "/";
    return location === href || location.startsWith(`${href}/`);
  });
}
