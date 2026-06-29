/**
 * Event Bus System
 *
 * Central message broker for inter-agent communication.
 * All agents communicate via events - no direct calls.
 *
 * Features:
 * - Pub/Sub pattern
 * - Event history (append-only log)
 * - Typed events per domain
 * - Async processing
 * - Metrics collection
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ─── Event Types ─────────────────────────────────────────────────────────────

export type EventDomain = "agent" | "tool" | "memory" | "decision" | "task" | "project" | "system" | "user";

export type EventAction =
  | "created" | "updated" | "deleted" | "completed" | "failed" | "started" | "stopped"
  | "requested" | "responded" | "delegated" | "escalated" | "approved" | "rejected"
  | "synced" | "analyzed" | "scheduled" | "cancelled";

export interface Event {
  id: string;
  timestamp: Date;
  domain: EventDomain;
  action: EventAction;
  source: string; // agent role or system component
  target?: string; // target agent or component
  entityType?: string;
  entityId?: number;
  payload: Record<string, unknown>;
  correlationId?: string; // for tracking related events
  causationId?: string; // what caused this event
}

export interface EventHandler {
  id: string;
  domain: EventDomain;
  filter?: (event: Event) => boolean;
  handler: (event: Event) => Promise<void>;
  priority: number;
}

// ─── Event Bus Core ───────────────────────────────────────────────────────────

class EventBusClass {
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventLog: Event[] = [];
  private maxLogSize = 1000;
  private pendingEvents: Event[] = [];
  private processing = false;
  private metrics = {
    totalPublished: 0,
    totalProcessed: 0,
    totalFailed: 0,
    avgLatencyMs: 0,
  };

  // Subscribe to events
  subscribe(
    domain: EventDomain,
    handler: (event: Event) => Promise<void>,
    options: { filter?: (event: Event) => boolean; priority?: number } = {}
  ): string {
    const id = `handler_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const handlerObj: EventHandler = {
      id,
      domain,
      filter: options.filter,
      handler,
      priority: options.priority || 0,
    };

    const existing = this.handlers.get(domain) || [];
    existing.push(handlerObj);
    existing.sort((a, b) => b.priority - a.priority);
    this.handlers.set(domain, existing);

    return id;
  }

  // Unsubscribe
  unsubscribe(handlerId: string): void {
    for (const [domain, handlers] of this.handlers.entries()) {
      const idx = handlers.findIndex(h => h.id === handlerId);
      if (idx >= 0) {
        handlers.splice(idx, 1);
        this.handlers.set(domain, handlers);
        return;
      }
    }
  }

  // Publish event
  async publish(event: Omit<Event, "id" | "timestamp">): Promise<string> {
    const fullEvent: Event = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };

    this.pendingEvents.push(fullEvent);
    this.metrics.totalPublished++;

    // Process asynchronously
    this.processQueue();

    return fullEvent.id;
  }

  // Process event queue
  private processQueue(): void {
    if (this.processing || this.pendingEvents.length === 0) return;

    this.processing = true;
    setImmediate(() => this.processNextEvent());
  }

  private async processNextEvent(): Promise<void> {
    const event = this.pendingEvents.shift();
    if (!event) {
      this.processing = false;
      return;
    }

    const startTime = Date.now();

    try {
      const handlers = this.handlers.get(event.domain) || [];

      for (const h of handlers) {
        if (h.filter && !h.filter(event)) continue;

        try {
          await h.handler(event);
        } catch (err) {
          console.error(`Handler ${h.id} failed for event ${event.id}:`, err);
        }
      }

      // Log event
      this.eventLog.push(event);
      if (this.eventLog.length > this.maxLogSize) {
        this.eventLog.shift();
      }

      this.metrics.totalProcessed++;
      this.metrics.avgLatencyMs =
        (this.metrics.avgLatencyMs * (this.metrics.totalProcessed - 1) + (Date.now() - startTime)) /
        this.metrics.totalProcessed;
    } catch (err) {
      this.metrics.totalFailed++;
      console.error(`Event processing failed:`, err);
    }

    // Continue processing
    if (this.pendingEvents.length > 0) {
      setImmediate(() => this.processNextEvent());
    } else {
      this.processing = false;
    }
  }

  // Query event log
  getEvents(filter: {
    domain?: EventDomain;
    source?: string;
    target?: string;
    entityType?: string;
    entityId?: number;
    correlationId?: string;
    since?: Date;
    limit?: number;
  }): Event[] {
    let results = [...this.eventLog];

    if (filter.domain) results = results.filter(e => e.domain === filter.domain);
    if (filter.source) results = results.filter(e => e.source === filter.source);
    if (filter.target) results = results.filter(e => e.target === filter.target);
    if (filter.entityType) results = results.filter(e => e.entityType === filter.entityType);
    if (filter.entityId) results = results.filter(e => e.entityId === filter.entityId);
    if (filter.correlationId) results = results.filter(e => e.correlationId === filter.correlationId);
    if (filter.since) results = results.filter(e => e.timestamp >= filter.since!);

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return results.slice(0, filter.limit || 100);
  }

  // Get metrics
  getMetrics() {
    return { ...this.metrics };
  }

  // Clear log
  clearLog(): void {
    this.eventLog = [];
  }
}

export const EventBus = new EventBusClass();

// ─── Event Helpers ────────────────────────────────────────────────────────────

export function emitAgentEvent(
  source: string,
  action: EventAction,
  payload: Record<string, unknown>,
  options?: { target?: string; correlationId?: string; causationId?: string }
): Promise<string> {
  return EventBus.publish({
    domain: "agent",
    source,
    target: options?.target,
    action,
    payload,
    correlationId: options?.correlationId,
    causationId: options?.causationId,
  });
}

export function emitToolEvent(
  source: string,
  action: EventAction,
  payload: Record<string, unknown>,
  options?: { entityType?: string; entityId?: number }
): Promise<string> {
  return EventBus.publish({
    domain: "tool",
    source,
    action,
    payload,
    entityType: options?.entityType,
    entityId: options?.entityId,
  });
}

export function emitMemoryEvent(
  source: string,
  action: EventAction,
  payload: Record<string, unknown>,
  options?: { entityId?: number }
): Promise<string> {
  return EventBus.publish({
    domain: "memory",
    source,
    action,
    payload,
    entityType: "memory",
    entityId: options?.entityId,
  });
}

export function emitDecisionEvent(
  source: string,
  action: EventAction,
  payload: Record<string, unknown>,
  options?: { entityId?: number }
): Promise<string> {
  return EventBus.publish({
    domain: "decision",
    source,
    action,
    payload,
    entityType: "decision",
    entityId: options?.entityId,
  });
}

export function emitSystemEvent(
  action: EventAction,
  payload: Record<string, unknown>
): Promise<string> {
  return EventBus.publish({
    domain: "system",
    source: "system",
    action,
    payload,
  });
}

// ─── Correlation Tracking ─────────────────────────────────────────────────────

const correlationContext = new Map<string, string>();

export function startCorrelation(): string {
  const id = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return id;
}

export function setCorrelationContext(key: string, correlationId: string): void {
  correlationContext.set(key, correlationId);
}

export function getCorrelationContext(key: string): string | undefined {
  return correlationContext.get(key);
}

export function clearCorrelationContext(key: string): void {
  correlationContext.delete(key);
}
