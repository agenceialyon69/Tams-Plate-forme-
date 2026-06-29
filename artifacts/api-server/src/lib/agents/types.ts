/**
 * Agent System Types
 * Core types for the multi-agent architecture
 */

export type AgentRole =
  | "chief_of_staff"    // Executive orchestration
  | "engineering"       // Code & technical analysis
  | "product"           // Product decisions & roadmap
  | "business"          // Business strategy & metrics
  | "marketing"         // Content & positioning
  | "research"          // Research & synthesis
  | "memory"            // Memory management
  | "decision"          // Decision analysis
  | "studio"            // Creative generation
  | "devops"            // Infrastructure & deployment
  | "red_team"          // Critical review & risk analysis
  | "planning";         // Task decomposition & planning

export type AgentCapability =
  | "analyze"      // Read and analyze data
  | "create"       // Create new items
  | "update"       // Modify existing items
  | "delete"       // Remove items
  | "search"       // Search internal/external
  | "generate"     // Generate content
  | "delegate"     // Delegate to other agents
  | "monitor";     // Monitor and alert

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface Agent {
  role: AgentRole;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  tools: AgentTool[];
  systemPrompt: string;
  fallbackResponse: string;
}

export interface AgentContext {
  userId?: string;
  conversationId?: number;
  projectId?: number;
  taskId?: number;
  decisionId?: number;
  memoryId?: number;
  contactId?: number;
  customContext?: Record<string, unknown>;
}

export interface AgentResponse {
  content: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: string;
  }>;
  delegatedTo?: AgentRole;
  confidence?: number;
  reasoning?: string;
}

export interface AgentRegistry {
  getAgent(role: AgentRole): Agent | undefined;
  getAllAgents(): Agent[];
  getAgentsForCapability(capability: AgentCapability): Agent[];
}
