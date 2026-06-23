-- TAMS Initial Schema
-- Core tables for the personal assistant system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants table (for future multi-tenant support)
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memory table (long-term knowledge base)
CREATE TABLE IF NOT EXISTS memory (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL DEFAULT 'personal',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  priority_domain TEXT,
  capture_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Decisions table (Red Team decision journal)
CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  context TEXT,
  analysis TEXT,
  priority_conflicts TEXT,
  blind_spots TEXT,
  alternatives TEXT,
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Captures table (quick capture of ideas)
CREATE TABLE IF NOT EXISTS captures (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events table (calendar events)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL,
  event_time TEXT,
  reminder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Learnings table
CREATE TABLE IF NOT EXISTS learnings (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recordings table (audio/video recordings)
CREATE TABLE IF NOT EXISTS recordings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration_seconds INTEGER,
  transcription TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evening reviews table
CREATE TABLE IF NOT EXISTS evening_reviews (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  wins TEXT,
  challenges TEXT,
  learnings TEXT,
  tomorrow_priorities TEXT,
  mood INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Energy logs table (wellbeing tracking)
CREATE TABLE IF NOT EXISTS energy_logs (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 10),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads table (for prospection)
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  score INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Copilot messages table (conversation history)
CREATE TABLE IF NOT EXISTS copilot_messages (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on conversation_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_id ON copilot_messages(conversation_id);

-- Audit logs table (immutable audit trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  user_id INTEGER,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- App events table (analytics/observability)
CREATE TABLE IF NOT EXISTS app_events (
  id SERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'backend',
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  importance TEXT DEFAULT 'medium',
  user_id INTEGER,
  tenant_id INTEGER,
  workspace_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registry entries (governance)
CREATE TABLE IF NOT EXISTS registry_entries (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval requests (governance)
CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kill switches (governance)
CREATE TABLE IF NOT EXISTS kill_switches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  triggered_by INTEGER REFERENCES users(id),
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant quotas
CREATE TABLE IF NOT EXISTS tenant_quotas (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  resource TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  used_value INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Member invitations
CREATE TABLE IF NOT EXISTS member_invitations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default tenant for personal use
INSERT INTO tenants (id, name, slug, plan) 
VALUES (1, 'Personal', 'personal', 'free')
ON CONFLICT (slug) DO NOTHING;
