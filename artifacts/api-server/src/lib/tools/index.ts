/**
 * Tool System
 *
 * Modular tool registry with:
 * - Permissions and validation
 * - Logging and observability
 * - Error handling with retries
 * - Timeouts
 * - Rate limiting per tool
 */

import { db } from "@workspace/db";
import { logActivity } from "../activity";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ToolPermission = "read" | "write" | "delete" | "external" | "admin";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    durationMs: number;
    retryCount: number;
    permission: ToolPermission[];
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermission;
  parameters: z.ZodObject<any>;
  timeout: number;        // ms
  maxRetries: number;
  rateLimit?: number;     // calls per minute
  execute: (params: any) => Promise<unknown>;
}

// ─── Tool Registry ─────────────────────────────────────────────────────────────

const toolRegistry: Map<string, ToolDefinition> = new Map();
const toolCallLog: Map<string, number[]> = new Map(); // timestamps for rate limiting

export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.name, tool);
  toolCallLog.set(tool.name, []);
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

export function listTools(): { name: string; description: string; permission: ToolPermission }[] {
  return Array.from(toolRegistry.values()).map(t => ({
    name: t.name,
    description: t.description,
    permission: t.permission,
  }));
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  context?: { userId?: string; conversationId?: number }
): Promise<ToolResult> {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }

  const startTime = Date.now();

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  if (tool.rateLimit) {
    const calls = toolCallLog.get(name) || [];
    const recentCalls = calls.filter(t => Date.now() - t < 60000);
    if (recentCalls.length >= tool.rateLimit) {
      return { success: false, error: `Rate limit exceeded for ${name}` };
    }
    recentCalls.push(Date.now());
    toolCallLog.set(name, recentCalls);
  }

  // ─── Validation ─────────────────────────────────────────────────────────────
  const parsed = tool.parameters.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid parameters: ${parsed.error.issues.map(i => i.message).join(", ")}`,
      metadata: {
        durationMs: Date.now() - startTime,
        retryCount: 0,
        permission: [tool.permission],
      },
    };
  }

  // ─── Execution with retries ──────────────────────────────────────────────────
  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= tool.maxRetries; attempt++) {
    if (attempt > 0) retryCount++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), tool.timeout);

      const result = await Promise.race([
        tool.execute(parsed.data),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), tool.timeout)
        ),
      ]);

      clearTimeout(timeoutId);

      // ─── Logging ────────────────────────────────────────────────────────────
      await logActivity("tool", name, `Tool ${name} executed successfully`, context?.conversationId || 0);

      return {
        success: true,
        data: result,
        metadata: {
          durationMs: Date.now() - startTime,
          retryCount,
          permission: [tool.permission],
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on validation or permission errors
      if (lastError.message.includes("Invalid") || lastError.message.includes("Permission")) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < tool.maxRetries) {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 5000)));
      }
    }
  }

  // ─── Error result ────────────────────────────────────────────────────────────
  await logActivity("tool", name, `Tool ${name} failed: ${lastError?.message}`, context?.conversationId || 0);

  return {
    success: false,
    error: lastError?.message || "Unknown error",
    metadata: {
      durationMs: Date.now() - startTime,
      retryCount,
      permission: [tool.permission],
    },
  };
}

// ─── Built-in Tools ───────────────────────────────────────────────────────────

// Task Management
registerTool({
  name: "create_task",
  description: "Create a new task in the system",
  permission: "write",
  parameters: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    projectId: z.number().optional(),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 60,
  execute: async (params) => {
    const { tasksTable } = await import("@workspace/db");
    const [created] = await db.insert(tasksTable).values({
      title: params.title,
      description: params.description || null,
      priority: params.priority || "medium",
      projectId: params.projectId || null,
    }).returning();
    return { id: created.id, title: created.title, priority: created.priority };
  },
});

registerTool({
  name: "list_tasks",
  description: "List tasks with optional filters",
  permission: "read",
  parameters: z.object({
    status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    limit: z.number().max(50).optional(),
  }),
  timeout: 3000,
  maxRetries: 1,
  rateLimit: 120,
  execute: async (params) => {
    const { tasksTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const limit = params.limit || 20;

    if (params.status) {
      return db.select().from(tasksTable)
        .where(eq(tasksTable.status, params.status))
        .limit(limit);
    }
    return db.select().from(tasksTable).limit(limit);
  },
});

registerTool({
  name: "update_task",
  description: "Update an existing task",
  permission: "write",
  parameters: z.object({
    id: z.number(),
    title: z.string().optional(),
    status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    description: z.string().optional(),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 60,
  execute: async (params) => {
    const { tasksTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { id, ...updates } = params;
    const [updated] = await db.update(tasksTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasksTable.id, id))
      .returning();
    return updated;
  },
});

// Project Management
registerTool({
  name: "create_project",
  description: "Create a new project",
  permission: "write",
  parameters: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 30,
  execute: async (params) => {
    const { projectsTable } = await import("@workspace/db");
    const [created] = await db.insert(projectsTable).values({
      name: params.name,
      description: params.description || null,
    }).returning();
    return { id: created.id, name: created.name };
  },
});

registerTool({
  name: "list_projects",
  description: "List all projects",
  permission: "read",
  parameters: z.object({
    status: z.enum(["active", "completed", "archived"]).optional(),
    limit: z.number().max(50).optional(),
  }),
  timeout: 3000,
  maxRetries: 1,
  rateLimit: 120,
  execute: async (params) => {
    const { projectsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const limit = params.limit || 20;

    if (params.status) {
      return db.select().from(projectsTable)
        .where(eq(projectsTable.status, params.status))
        .limit(limit);
    }
    return db.select().from(projectsTable).limit(limit);
  },
});

// Contact Management
registerTool({
  name: "create_contact",
  description: "Create a new contact",
  permission: "write",
  parameters: z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    status: z.enum(["prospect", "active", "inactive", "client"]).optional(),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 30,
  execute: async (params) => {
    const { contactsTable } = await import("@workspace/db");
    const [created] = await db.insert(contactsTable).values({
      name: params.name,
      company: params.company || null,
      email: params.email || null,
      phone: params.phone || null,
      status: params.status || "prospect",
    }).returning();
    return { id: created.id, name: created.name, status: created.status };
  },
});

registerTool({
  name: "list_contacts",
  description: "List contacts with optional filters",
  permission: "read",
  parameters: z.object({
    status: z.enum(["prospect", "active", "inactive", "client"]).optional(),
    limit: z.number().max(50).optional(),
  }),
  timeout: 3000,
  maxRetries: 1,
  rateLimit: 120,
  execute: async (params) => {
    const { contactsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const limit = params.limit || 20;

    if (params.status) {
      return db.select().from(contactsTable)
        .where(eq(contactsTable.status, params.status))
        .limit(limit);
    }
    return db.select().from(contactsTable).limit(limit);
  },
});

// Memory Management
registerTool({
  name: "create_memory",
  description: "Save information to memory",
  permission: "write",
  parameters: z.object({
    title: z.string().min(1),
    content: z.string().optional(),
    type: z.enum(["person", "project", "company", "decision", "note", "goal", "event"]),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 60,
  execute: async (params) => {
    const { memoriesTable } = await import("@workspace/db");
    const [created] = await db.insert(memoriesTable).values({
      title: params.title,
      content: params.content || null,
      type: params.type,
    }).returning();
    return { id: created.id, title: created.title, type: created.type };
  },
});

registerTool({
  name: "search_memories",
  description: "Search memories by query",
  permission: "read",
  parameters: z.object({
    query: z.string().min(1),
    limit: z.number().max(20).optional(),
  }),
  timeout: 5000,
  maxRetries: 1,
  rateLimit: 60,
  execute: async (params) => {
    const { memoriesTable } = await import("@workspace/db");
    const { or, like } = await import("drizzle-orm");
    const results = await db.select().from(memoriesTable)
      .where(or(
        like(memoriesTable.title, `%${params.query}%`),
        like(memoriesTable.content, `%${params.query}%`)
      ))
      .limit(params.limit || 5);
    return results;
  },
});

// Decision Management
registerTool({
  name: "create_decision",
  description: "Create a new decision to analyze",
  permission: "write",
  parameters: z.object({
    title: z.string().min(1),
    context: z.string().optional(),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 30,
  execute: async (params) => {
    const { decisionsTable } = await import("@workspace/db");
    const [created] = await db.insert(decisionsTable).values({
      title: params.title,
      context: params.context || null,
    }).returning();
    return { id: created.id, title: created.title };
  },
});

registerTool({
  name: "list_decisions",
  description: "List decisions with optional status filter",
  permission: "read",
  parameters: z.object({
    status: z.enum(["pending", "analyzing", "decided", "cancelled"]).optional(),
    limit: z.number().max(50).optional(),
  }),
  timeout: 3000,
  maxRetries: 1,
  rateLimit: 120,
  execute: async (params) => {
    const { decisionsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const limit = params.limit || 20;

    if (params.status) {
      return db.select().from(decisionsTable)
        .where(eq(decisionsTable.status, params.status))
        .limit(limit);
    }
    return db.select().from(decisionsTable).limit(limit);
  },
});

// Asset Management
registerTool({
  name: "create_asset",
  description: "Create a new creative asset",
  permission: "write",
  parameters: z.object({
    name: z.string().min(1),
    type: z.enum(["image", "video", "audio", "document", "prompt", "template", "result"]),
    content: z.string().optional(),
    url: z.string().url().optional(),
    tags: z.array(z.string()).optional(),
  }),
  timeout: 5000,
  maxRetries: 2,
  rateLimit: 60,
  execute: async (params) => {
    const { assetsTable } = await import("@workspace/db");
    const [created] = await db.insert(assetsTable).values({
      name: params.name,
      type: params.type,
      content: params.content || null,
      url: params.url || null,
      tags: params.tags || [],
    }).returning();
    return { id: created.id, name: created.name, type: created.type };
  },
});

export { toolRegistry };
