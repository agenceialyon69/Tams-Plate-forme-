/**
 * Outils & contexte partagés des agents (Pilier 2 Chat OS + Pilier 3 Agent System).
 *
 * Source unique de vérité pour : le prompt système TAMS, les prompts de mode, la
 * collecte du contexte utilisateur, le catalogue d'outils OpenAI-compatible et
 * leur exécution. Utilisé par le Chat (conversations.ts) ET le système d'agents
 * (agents.ts) — pas de duplication.
 */
import { db } from "@workspace/db";
import {
  tasksTable,
  projectsTable,
  contactsTable,
  memoriesTable,
  decisionsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

export const SYSTEM_PROMPT = `Tu es TAMS, un Chief of Staff personnel IA. Tu aides Mohamed à prendre de meilleures décisions, gérer ses priorités, analyser ses risques et exécuter sa vision. Tu es direct, précis, sans langue de bois. Tu réponds toujours en français.

Tu as accès au contexte de Mohamed (tâches, projets, contacts, mémoires, décisions) et tu peux agir sur son système en appelant des fonctions quand c'est pertinent. Par exemple, si Mohamed te demande de créer une tâche, utilise la fonction create_task. Si il te parle d'un nouveau contact, propose de l'ajouter avec create_contact.`;

export const MODE_PROMPTS: Record<string, string> = {
  chief_of_staff: `Mode Chef de Cabinet : Tu analyses la situation globale de Mohamed — projets, tâches, contacts — et tu fournis un briefing stratégique actionnable. Sois direct et synthétique. Utilise le contexte fourni pour donner des conseils pertinents.`,
  decision: `Mode Décision : Tu aides Mohamed à structurer et analyser une décision. Tu identifies les options, les avantages, les risques, et tu donnes un avis clair avec un niveau de confiance. Si Mohamed décide, tu peux créer la décision dans le système avec create_decision.`,
  red_team: `Mode Red Team : Tu joues l'avocat du diable. Tu identifies les failles, les risques cachés, les erreurs de raisonnement. Tu es critique constructif, jamais complaisant.`,
  execution: `Mode Exécution : Tu transformes les intentions en actions concrètes. Tu génères des plans d'action précis, des listes de tâches, des priorités claires. Utilise create_task pour ajouter les tâches au système quand Mohamed te le demande.`,
  chat: `Mode Conversation : Tu es un assistant intelligent et direct. Tu réponds aux questions, analyses les situations, explores les idées. Tu peux aussi créer des éléments dans le système si Mohamed te le demande.`,
};

export async function gatherUserContext(): Promise<string> {
  try {
    const [tasks, projects, contacts, memories, decisions] = await Promise.all([
      db.select().from(tasksTable)
        .where(sql`${tasksTable.status} NOT IN ('done','cancelled')`)
        .orderBy(desc(tasksTable.createdAt))
        .limit(5),
      db.select().from(projectsTable)
        .where(eq(projectsTable.status, "active"))
        .limit(5),
      db.select().from(contactsTable)
        .orderBy(desc(contactsTable.createdAt))
        .limit(5),
      db.select().from(memoriesTable)
        .orderBy(desc(memoriesTable.createdAt))
        .limit(5),
      db.select().from(decisionsTable)
        .where(sql`${decisionsTable.status} IN ('pending','analyzing')`)
        .limit(3),
    ]);

    return [
      tasks.length > 0 ? `Tâches actives: ${tasks.map(t => `"${t.title}" (${t.priority})`).join(", ")}` : "",
      projects.length > 0 ? `Projets actifs: ${projects.map(p => `"${p.name}"`).join(", ")}` : "",
      contacts.length > 0 ? `Contacts récents: ${contacts.map(c => c.name).join(", ")}` : "",
      memories.length > 0 ? `Mémoires récentes: ${memories.map(m => `"${m.title}"`).join(", ")}` : "",
      decisions.length > 0 ? `Décisions en cours: ${decisions.map(d => `"${d.title}"`).join(", ")}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "Contexte non disponible.";
  }
}

export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Crée une nouvelle tâche dans le système",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la tâche" },
          description: { type: "string", description: "Description optionnelle" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priorité" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: "Crée un nouveau projet",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du projet" },
          description: { type: "string", description: "Description optionnelle" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_contact",
      description: "Crée un nouveau contact",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom complet" },
          company: { type: "string", description: "Entreprise" },
          email: { type: "string", description: "Email" },
          status: { type: "string", enum: ["prospect", "client", "partner", "inactive"] },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_decision",
      description: "Crée une nouvelle décision à analyser",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la décision" },
          context: { type: "string", description: "Contexte et enjeux" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_memory",
      description: "Enregistre une information importante en mémoire",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre" },
          content: { type: "string", description: "Contenu" },
          type: { type: "string", enum: ["person", "project", "company", "decision", "note", "goal", "event"] },
        },
        required: ["title", "type"],
      },
    },
  },
];

/** Liste des noms d'outils disponibles (pour limiter les agents). */
export const TOOL_NAMES = TOOLS.map(t => t.function.name);

/** Sous-ensemble du catalogue d'outils restreint à `names` (limites par agent). */
export function toolsFor(names: string[]): typeof TOOLS {
  return TOOLS.filter(t => names.includes(t.function.name));
}

export async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "create_task": {
        const [created] = await db.insert(tasksTable).values({
          title: args.title,
          description: args.description || null,
          priority: args.priority || "medium",
        }).returning();
        return `Tâche créée: "${created.title}" (ID: ${created.id}, priorité: ${created.priority})`;
      }
      case "create_project": {
        const [created] = await db.insert(projectsTable).values({
          name: args.name,
          description: args.description || null,
        }).returning();
        return `Projet créé: "${created.name}" (ID: ${created.id})`;
      }
      case "create_contact": {
        const [created] = await db.insert(contactsTable).values({
          name: args.name,
          company: args.company || null,
          email: args.email || null,
          status: args.status || "prospect",
        }).returning();
        return `Contact créé: "${created.name}" (ID: ${created.id}, statut: ${created.status})`;
      }
      case "create_decision": {
        const [created] = await db.insert(decisionsTable).values({
          title: args.title,
          context: args.context || null,
        }).returning();
        return `Décision créée: "${created.title}" (ID: ${created.id})`;
      }
      case "create_memory": {
        const [created] = await db.insert(memoriesTable).values({
          title: args.title,
          content: args.content || null,
          type: args.type || "note",
        }).returning();
        return `Mémoire enregistrée: "${created.title}" (ID: ${created.id})`;
      }
      default:
        return `Fonction inconnue: ${name}`;
    }
  } catch (err) {
    return `Erreur lors de l'exécution de ${name}: ${err instanceof Error ? err.message : "erreur inconnue"}`;
  }
}
