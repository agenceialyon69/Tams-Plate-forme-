/**
 * Chat Capabilities Route
 *
 * Exposes what TAMS can do to the Chat OS frontend.
 * Used to render the "TAMS can do" panel and populate mode-aware suggestions.
 */

import { Router } from "express";
import { getRuntimeSafeCapabilities, getEnabledProviderIds } from "./capability-registry.js";

const router = Router();

// ─── GET /api/chat/capabilities ────────────────────────────────────────────────
//
// Returns a structured list of what TAMS can do today, grouped by domain.
// Safe for unauthenticated access — no sensitive info.

router.get("/chat/capabilities", (_req, res) => {
  const safeCapabilities = getRuntimeSafeCapabilities();
  const enabledProviders = getEnabledProviderIds();

  const grouped: Record<string, {
    id: string;
    label: string;
    description: string;
    category: string;
    status: string;
    validationNotes?: string;
  }[]> = {};

  for (const cap of safeCapabilities) {
    if (!grouped[cap.category]) grouped[cap.category] = [];
    grouped[cap.category].push({
      id: cap.id,
      label: cap.label,
      description: cap.description,
      category: cap.category,
      status: cap.status,
      validationNotes: cap.validationNotes,
    });
  }

  const TAMS_MODES = [
    {
      mode: "chat",
      label: "Conversation",
      description: "Conversation libre avec le Chief of Staff. Crée des tâches, projets, contacts.",
      examples: [
        "Crée une tâche pour finir la démo",
        "Nouveau projet: Lancement KORE",
        "Génère une image pour ma présentation",
      ],
    },
    {
      mode: "decision",
      label: "Décision",
      description: "Analyse une décision stratégique. Pros/cons, risques, alternatives.",
      examples: [
        "Dois-je lancer TAMS en beta fermée ?",
        "Analyse les risques du nouveau partenariat",
        "Liste les avantages et inconvénients de...",
      ],
    },
    {
      mode: "red_team",
      label: "Red Team",
      description: "Cherche ce qui peut mal tourner. Challenge tes hypothèses.",
      examples: [
        "Qu'est-ce qui pourrait faire échouer ce projet ?",
        "Quelles sont les failles de ma stratégie ?",
        "Joue l'avocat du diable sur...",
      ],
    },
    {
      mode: "chief_of_staff",
      label: "Chef de Cabinet",
      description: "Vue d'ensemble de ton agenda, priorités, risques du jour.",
      examples: [
        "Quel est mon briefing du jour ?",
        "Quelles sont mes priorités cette semaine ?",
        "Qu'est-ce que je dois surveiller ?",
      ],
    },
    {
      mode: "execution",
      label: "Exécution",
      description: "Mode action. Crée des objets directement via des commandes slash.",
      examples: [
        "/tâche Finaliser le pitch deck",
        "/projet Campagne TikTok Q1",
        "/contact Marie Dupont, CMO",
      ],
    },
  ];

  const TAMS_CAN_DO = [
    {
      domain: "Analyse & Décision",
      icon: "brain",
      available: true,
      actions: [
        { label: "Analyser une décision", prompt: "Aide-moi à décider : ", available: true },
        { label: "Red Team / risques", prompt: "Qu'est-ce qui pourrait mal tourner avec ", available: true },
        { label: "Interroger la mémoire", prompt: "Qu'est-ce que tu sais sur ", available: true },
      ],
    },
    {
      domain: "Studio Créatif",
      icon: "palette",
      available: true,
      actions: [
        { label: "Créer un plan Studio", prompt: "/studio ", available: true },
        { label: "Générer une image", prompt: "/image ", available: true },
        { label: "Script / brief", prompt: "/script ", available: true },
        { label: "Plan musique", prompt: "Crée un plan musical pour ", available: true },
        { label: "Plan vidéo", prompt: "Crée un plan vidéo pour ", available: true },
      ],
    },
    {
      domain: "Projets & Tâches",
      icon: "folder",
      available: true,
      actions: [
        { label: "Créer un projet", prompt: "/projet ", available: true },
        { label: "Créer une tâche", prompt: "/tâche ", available: true },
        { label: "Ajouter un contact", prompt: "/contact ", available: true },
      ],
    },
    {
      domain: "Système",
      icon: "monitor",
      available: true,
      actions: [
        { label: "Vérifier le système", prompt: "Vérifie la santé du système", available: true },
        { label: "Statut des providers", prompt: "Quel est l'état des providers ?", available: true },
        { label: "Kernel status", prompt: "Quel est l'état du Kernel ?", available: true },
      ],
    },
    {
      domain: "Dev Runtime",
      icon: "terminal",
      available: false,
      availableNote: "Nécessite TAMS_DEV_RUNTIME_ENABLED=true",
      actions: [
        { label: "Audit repo (read-only)", prompt: "/runtime audit", available: false },
        { label: "Valider le build", prompt: "/runtime validate", available: false },
        { label: "Proposer un patch", prompt: "/runtime patch", available: false },
      ],
    },
  ];

  res.json({
    modes: TAMS_MODES,
    canDo: TAMS_CAN_DO,
    capabilities: {
      grouped,
      total: safeCapabilities.length,
      available: safeCapabilities.filter(c => c.status === "available").length,
      planned: safeCapabilities.filter(c => c.status === "planned").length,
    },
    providers: {
      enabled: enabledProviders,
      count: enabledProviders.length,
    },
    honestyNote: "TAMS ne génère jamais de vidéo/musique/voix si le provider n'est pas connecté. Toutes les capacités planifiées sont clairement marquées.",
  });
});

export default router;
