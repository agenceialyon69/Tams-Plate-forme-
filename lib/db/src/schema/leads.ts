import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  // Identity
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  website: text("website"),
  // Context
  role: text("role"),
  industry: text("industry"),
  source: text("source").notNull().default("manual"),
  // Status workflow
  status: text("status").notNull().default("new"),        // new|contacted|nurturing|proposal|won|lost|paused
  priority: text("priority").notNull().default("medium"),  // high|medium|low
  // AI scoring
  score: integer("score"),                                 // 0-100
  conversionProbability: integer("conversion_probability"),// 0-100
  nextBestAction: text("next_best_action"),
  redTeamWarning: text("red_team_warning"),
  scoredAt: timestamp("scored_at", { withTimezone: true }),
  // Enrichment
  companySize: text("company_size"),
  budget: text("budget"),
  decisionTimeline: text("decision_timeline"),
  painPoints: text("pain_points"),
  signals: text("signals"),                                // intent signals, news, triggers
  tags: text("tags").array().notNull().default([]),
  // Notes
  notes: text("notes"),
  nextActionDate: text("next_action_date"),
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadActivitiesTable = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  type: text("type").notNull(),  // note|call|email|meeting|linkedin|status_change|score|next_action
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
