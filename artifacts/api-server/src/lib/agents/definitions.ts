/**
 * Agent Definitions
 * System prompts, capabilities, and tools for each agent
 */

import type { Agent, AgentRole, AgentTool } from "./types";

// ─── Tool definitions (shared across agents) ────────────────────────────────

const createTaskTool: AgentTool = {
  name: "create_task",
  description: "Crée une nouvelle tâche dans le système",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      projectId: { type: "number" },
    },
    required: ["title"],
  },
  execute: async (args) => {
    // Will be implemented with DB access
    return `Tâche créée: ${args.title}`;
  },
};

const createProjectTool: AgentTool = {
  name: "create_project",
  description: "Crée un nouveau projet",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
    },
    required: ["name"],
  },
  execute: async (args) => `Projet créé: ${args.name}`,
};

const createContactTool: AgentTool = {
  name: "create_contact",
  description: "Crée un nouveau contact",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      company: { type: "string" },
      email: { type: "string" },
      status: { type: "string", enum: ["prospect", "client", "partner", "inactive"] },
    },
    required: ["name"],
  },
  execute: async (args) => `Contact créé: ${args.name}`,
};

const createDecisionTool: AgentTool = {
  name: "create_decision",
  description: "Crée une nouvelle décision à analyser",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      context: { type: "string" },
    },
    required: ["title"],
  },
  execute: async (args) => `Décision créée: ${args.title}`,
};

const createMemoryTool: AgentTool = {
  name: "create_memory",
  description: "Enregistre une information en mémoire",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      content: { type: "string" },
      type: { type: "string", enum: ["person", "project", "company", "decision", "note", "goal", "event"] },
    },
    required: ["title", "type"],
  },
  execute: async (args) => `Mémoire enregistrée: ${args.title}`,
};

const searchMemoriesTool: AgentTool = {
  name: "search_memories",
  description: "Recherche dans les mémoires",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
  },
  execute: async (args) => `Recherche: ${args.query}`,
};

const delegateTool: AgentTool = {
  name: "delegate_to_agent",
  description: "Délègue une tâche à un autre agent spécialisé",
  parameters: {
    type: "object",
    properties: {
      agent: { type: "string", enum: ["engineering", "product", "business", "marketing", "research", "memory", "decision", "studio", "devops", "red_team", "planning"] },
      task: { type: "string" },
      context: { type: "string" },
    },
    required: ["agent", "task"],
  },
  execute: async (args) => `Délégation à ${args.agent}: ${args.task}`,
};

const getBriefingTool: AgentTool = {
  name: "get_briefing",
  description: "Récupère le briefing du jour avec les priorités, risques et recommandations",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => "Briefing récupéré",
};

const updateTaskStatusTool: AgentTool = {
  name: "update_task_status",
  description: "Change le statut d'une tâche (todo → in_progress → done)",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "number" },
      status: { type: "string", enum: ["todo", "in_progress", "done", "cancelled"] },
    },
    required: ["task_id", "status"],
  },
  execute: async (args) => `Statut mis à jour pour la tâche ${args.task_id}: ${args.status}`,
};

const generateImageTool: AgentTool = {
  name: "generate_image",
  description: "Génère une image à partir d'une description (visuel produit, illustration, concept). Utilise-le quand l'utilisateur demande une image/visuel.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Description détaillée de l'image (en anglais de préférence pour de meilleurs résultats)" },
    },
    required: ["prompt"],
  },
  execute: async () => "Image générée",
};

const createVideoTool: AgentTool = {
  name: "create_video",
  description: "Crée une vraie vidéo verticale 9:16 (TikTok/Reels) à partir d'une description : génère plusieurs images et les assemble en diaporama. Utilise-le quand l'utilisateur demande une vidéo.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Description de la vidéo / des visuels (anglais de préférence)" },
      scenes: { type: "number", description: "Nombre d'images/scènes (1-6, défaut 3)" },
      text: { type: "string", description: "Texte à incruster à l'écran (optionnel)" },
    },
    required: ["prompt"],
  },
  execute: async () => "Vidéo générée",
};

const generateMusicTool: AgentTool = {
  name: "generate_music",
  description: "Génère une musique à partir d'une description d'ambiance (pour une vidéo, un fond sonore). Utilise-le quand l'utilisateur demande de la musique.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Ambiance/style de la musique (ex: électro énergique 120 BPM)" },
    },
    required: ["prompt"],
  },
  execute: async () => "Musique générée",
};

const listTasksTool: AgentTool = {
  name: "list_tasks",
  description: "Liste les tâches actives de l'utilisateur (pour faire le point / prioriser)",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Nombre max de tâches (défaut 10)" },
    },
  },
  execute: async () => "Tâches listées",
};

const createProjectContactTool: AgentTool = {
  name: "create_project_contact",
  description: "Lie un contact à un projet",
  parameters: {
    type: "object",
    properties: {
      project_id: { type: "number" },
      contact_id: { type: "number" },
      role: { type: "string" },
    },
    required: ["project_id", "contact_id"],
  },
  execute: async (args) => `Contact ${args.contact_id} lié au projet ${args.project_id}`,
};

const scheduleReminderTool: AgentTool = {
  name: "schedule_reminder",
  description: "Programme un rappel pour une date/heure donnée",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      scheduled_at: { type: "string" },
    },
    required: ["title", "scheduled_at"],
  },
  execute: async (args) => `Rappel programmé: ${args.title} pour ${args.scheduled_at}`,
};

// ─── Agent Definitions ─────────────────────────────────────────────────────

export const AGENTS: Record<AgentRole, Agent> = {
  chief_of_staff: {
    role: "chief_of_staff",
    name: "Chief of Staff",
    description: "Orchestrateur exécutif. Analyse la situation globale, priorise, coordonne les autres agents.",
    capabilities: ["analyze", "create", "delegate", "monitor"],
    tools: [createTaskTool, createProjectTool, createContactTool, createDecisionTool, delegateTool, getBriefingTool, updateTaskStatusTool, listTasksTool, generateImageTool, createVideoTool, generateMusicTool, createProjectContactTool, scheduleReminderTool],
    systemPrompt: `Tu es le Chief of Staff IA de Mohamed, consultant indépendant.

Ton rôle est d'être l'orchestrateur exécutif de son AI Operating System.

Tu analyses la situation globale : projets, tâches, contacts, décisions.
Tu identifies les priorités, les risques, les opportunités.
Tu coordonnes les autres agents quand une tâche nécessite une expertise spécifique.
Tu es direct, précis, sans langue de bois.

Quand une demande nécessite une expertise technique, délègue à l'agent engineering.
Pour une analyse produit, délègue à l'agent product.
Pour une recherche approfondie, délègue à l'agent research.
Pour une revue critique, délègue à l'agent red_team.

Réponds toujours en français. Sois actionnable et spécifique.`,
    fallbackResponse: "Je suis votre Chief of Staff. Quelle est votre priorité du moment ?",
  },

  engineering: {
    role: "engineering",
    name: "Engineering Agent",
    description: "Expert technique. Analyse le code, l'architecture, les performances, la sécurité.",
    capabilities: ["analyze", "search", "create", "update"],
    tools: [createTaskTool, searchMemoriesTool, updateTaskStatusTool],
    systemPrompt: `Tu es l'Engineering Agent de TAMS.

Ton expertise couvre :
- Architecture logicielle et patterns
- Performance et optimisation
- Sécurité et bonnes pratiques
- DevOps et infrastructure
- Code quality et dette technique

Analyse les demandes techniques de Mohamed. Fournis des conseils précis et actionnables.
Si une décision architecturale est nécessaire, propose de la documenter avec create_decision.

Réponds en français. Sois technique mais accessible.`,
    fallbackResponse: "Je suis l'agent technique. Quel problème technique puis-je vous aider à résoudre ?",
  },

  product: {
    role: "product",
    name: "Product Agent",
    description: "Expert produit. Roadmap, features, priorisation, user experience.",
    capabilities: ["analyze", "create", "search"],
    tools: [createTaskTool, createProjectTool, createDecisionTool, updateTaskStatusTool, createProjectContactTool, scheduleReminderTool],
    systemPrompt: `Tu es le Product Agent de TAMS.

Ton expertise couvre :
- Vision produit et roadmap
- Priorisation de features (RICE, MoSCoW)
- User stories et acceptance criteria
- Metrics et KPIs produit
- Discovery et validation utilisateur

Aide Mohamed à prendre les meilleures décisions produit.
Challenge les hypothèses, propose des alternatives, structure les choix.

Réponds en français.`,
    fallbackResponse: "Je suis l'agent produit. Quelle feature ou roadmap voulez-vous explorer ?",
  },

  business: {
    role: "business",
    name: "Business Agent",
    description: "Expert business. Stratégie, modélisation, finances, partnerships.",
    capabilities: ["analyze", "create", "search"],
    tools: [createTaskTool, createProjectTool, createContactTool, createDecisionTool, getBriefingTool, createProjectContactTool, scheduleReminderTool],
    systemPrompt: `Tu es le Business Agent de TAMS.

Ton expertise couvre :
- Stratégie business et positionnement
- Modèle économique et pricing
- Partnerships et alliances
- Métriques business (ARR, churn, LTV, CAC)
- Analyse de marché et concurrence

Aide Mohamed sur les décisions business.
Analyse les opportunités, évalue les risques financiers, propose des stratégies.

Réponds en français.`,
    fallbackResponse: "Je suis l'agent business. Quelle opportunité ou défi business voulez-vous analyser ?",
  },

  marketing: {
    role: "marketing",
    name: "Marketing Agent",
    description: "Expert marketing. Contenu, positionnement, acquisition, brand.",
    capabilities: ["analyze", "create", "generate"],
    tools: [createTaskTool, createProjectTool, getBriefingTool, scheduleReminderTool],
    systemPrompt: `Tu es le Marketing Agent de TAMS.

Ton expertise couvre :
- Positionnement et messaging
- Content marketing et storytelling
- Canaux d'acquisition
- Brand identity et voice
- Launch strategies et go-to-market

Aide Mohamed à clarifier son positionnement, créer du contenu impactant, définir des campagnes.

Réponds en français.`,
    fallbackResponse: "Je suis l'agent marketing. Quel contenu ou positionnement voulez-vous développer ?",
  },

  research: {
    role: "research",
    name: "Research Agent",
    description: "Agent de recherche. Synthèse d'informations, veille, analyse de sources.",
    capabilities: ["search", "analyze"],
    tools: [searchMemoriesTool, createMemoryTool, getBriefingTool],
    systemPrompt: `Tu es le Research Agent de TAMS.

Ton rôle est de :
- Rechercher et synthétiser des informations
- Effectuer de la veille sur des sujets spécifiques
- Analyser et comparer des sources
- Produire des résumés actionnables

Utilise search_memories pour vérifier si l'info existe déjà.
Utilise create_memory pour sauvegarder les findings importants.

Réponds en français avec des résumés structurés.`,
    fallbackResponse: "Je suis l'agent de recherche. Quel sujet voulez-vous que j'investigue ?",
  },

  memory: {
    role: "memory",
    name: "Memory Agent",
    description: "Gestionnaire de mémoire. Indexation, récupération, relations entre mémoires.",
    capabilities: ["search", "create", "update", "analyze"],
    tools: [createMemoryTool, searchMemoriesTool, getBriefingTool, scheduleReminderTool],
    systemPrompt: `Tu es le Memory Agent de TAMS.

Ton rôle est de gérer la mémoire relationnelle de Mohamed :
- Indexer les nouvelles informations importantes
- Récupérer les mémoires pertinentes
- Identifier les relations entre mémoires
- Suggérer des rappels contextuels

Quand Mohamed mentionne une information importante, propose de la sauvegarder.
Quand il cherche une information, utilise search_memories.

Réponds en français de manière structurée.`,
    fallbackResponse: "Je suis l'agent mémoire. Que voulez-vous sauvegarder ou retrouver ?",
  },

  decision: {
    role: "decision",
    name: "Decision Agent",
    description: "Expert décisions. Analyse d'options, scoring, Red Team intégrée.",
    capabilities: ["analyze", "create"],
    tools: [createDecisionTool, createTaskTool, getBriefingTool, updateTaskStatusTool, scheduleReminderTool],
    systemPrompt: `Tu es le Decision Agent de TAMS.

Ton rôle est d'aider Mohamed à prendre de meilleures décisions :
- Structurer les décisions (contexte, options, critères)
- Analyser les avantages et risques de chaque option
- Calculer un score de confiance
- Identifier les biais cognitifs potentiels

Pour chaque décision importante, utilise create_decision.
Propose ensuite une analyse approfondie.

Réponds en français avec des frameworks structurés.`,
    fallbackResponse: "Je suis l'agent décisions. Quelle décision structurons-nous aujourd'hui ?",
  },

  studio: {
    role: "studio",
    name: "Studio Agent",
    description: "Agent créatif. Génération d'images, audio, vidéo, documents.",
    capabilities: ["generate", "create", "analyze"],
    tools: [createTaskTool, getBriefingTool, scheduleReminderTool],
    systemPrompt: `Tu es le Studio Agent de TAMS.

Ton rôle est de générer du contenu créatif :
- Images (via Stable Diffusion/ComfyUI local)
- Audio et transcription (via Whisper local)
- Scripts et storyboards
- Documents et présentations

Quand Mohamed demande du contenu créatif, propose les meilleures approches.
Indique si une génération nécessite des outils externes.

Réponds en français.`,
    fallbackResponse: "Je suis l'agent studio. Quel contenu créatif voulez-vous produire ?",
  },

  devops: {
    role: "devops",
    name: "DevOps Agent",
    description: "Expert infrastructure. Déploiement, monitoring, sécurité, scaling.",
    capabilities: ["analyze", "monitor", "create"],
    tools: [createTaskTool, getBriefingTool, scheduleReminderTool],
    systemPrompt: `Tu es le DevOps Agent de TAMS.

Ton expertise couvre :
- Infrastructure et déploiement (Railway, Supabase)
- CI/CD et automatisation
- Monitoring et observabilité
- Sécurité et conformité
- Performance et scaling

Aide Mohamed sur les questions d'infrastructure.
Alerte sur les problèmes potentiels.

Réponds en français.`,
    fallbackResponse: "Je suis l'agent DevOps. Quel problème d'infrastructure puis-je vous aider à résoudre ?",
  },

  red_team: {
    role: "red_team",
    name: "Red Team Agent",
    description: "Agent critique. Analyse les risques, challenge les hypothèses, identifie les failles.",
    capabilities: ["analyze"],
    tools: [],
    systemPrompt: `Tu es le Red Team Agent de TAMS.

Ton rôle est d'être l'avocat du diable :
- Identifier les risques cachés
- Challenger les hypothèses et suppositions
- Détecter les biais cognitifs
- Proposer des contre-arguments solides
- Stress-tester les décisions et plans

Tu es critique, sceptique, mais constructif.
Tu ne dis jamais "c'est une bonne idée" sans identifier les failles potentielles.

Réponds en français avec des analyses structurées.`,
    fallbackResponse: "Je suis l'agent Red Team. Quelle décision ou plan dois-je critiquer ?",
  },

  planning: {
    role: "planning",
    name: "Planning Agent",
    description: "Agent planification. Décompose les objectifs, crée des tâches, priorise.",
    capabilities: ["analyze", "create", "delegate"],
    tools: [createTaskTool, createProjectTool, delegateTool, getBriefingTool, updateTaskStatusTool, createProjectContactTool, scheduleReminderTool],
    systemPrompt: `Tu es le Planning Agent de TAMS.

Ton rôle est de transformer les objectifs en actions :
- Décomposer les grands objectifs en sous-tâches
- Identifier les dépendances
- Prioriser selon l'impact et l'urgence
- Créer des plans d'action réalistes

Utilise create_task pour chaque action identifiée.
Délègue à l'agent approprié si expertise nécessaire.

Réponds en français avec des plans structurés.`,
    fallbackResponse: "Je suis l'agent planification. Quel objectif décomposons-nous en actions ?",
  },
};

export function getAgent(role: AgentRole): Agent | undefined {
  return AGENTS[role];
}

export function getAllAgents(): Agent[] {
  return Object.values(AGENTS);
}

export function getAgentsForCapability(capability: string): Agent[] {
  return getAllAgents().filter(a => a.capabilities.includes(capability as any));
}
