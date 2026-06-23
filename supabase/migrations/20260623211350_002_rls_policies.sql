-- Enable Row Level Security on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evening_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kill_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_invitations ENABLE ROW LEVEL SECURITY;

-- For a personal single-user system, we allow all authenticated access
-- This will be tightened when multi-tenant is implemented

-- Tenants: Allow all for authenticated users (single tenant setup)
CREATE POLICY "tenants_select" ON tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenants_all" ON tenants FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Users: Allow management by authenticated users
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Memory: Allow all operations for authenticated users
CREATE POLICY "memory_select" ON memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "memory_insert" ON memory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "memory_update" ON memory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "memory_delete" ON memory FOR DELETE TO authenticated USING (true);

-- Tasks: Allow all operations for authenticated users
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated USING (true);

-- Decisions: Allow all operations for authenticated users
CREATE POLICY "decisions_select" ON decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "decisions_insert" ON decisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "decisions_update" ON decisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "decisions_delete" ON decisions FOR DELETE TO authenticated USING (true);

-- Captures: Allow all operations for authenticated users
CREATE POLICY "captures_select" ON captures FOR SELECT TO authenticated USING (true);
CREATE POLICY "captures_insert" ON captures FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "captures_update" ON captures FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "captures_delete" ON captures FOR DELETE TO authenticated USING (true);

-- Events: Allow all operations for authenticated users
CREATE POLICY "events_select" ON events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_insert" ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "events_update" ON events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "events_delete" ON events FOR DELETE TO authenticated USING (true);

-- Learnings: Allow all operations for authenticated users
CREATE POLICY "learnings_select" ON learnings FOR SELECT TO authenticated USING (true);
CREATE POLICY "learnings_insert" ON learnings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "learnings_update" ON learnings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "learnings_delete" ON learnings FOR DELETE TO authenticated USING (true);

-- Recordings: Allow all operations for authenticated users
CREATE POLICY "recordings_select" ON recordings FOR SELECT TO authenticated USING (true);
CREATE POLICY "recordings_insert" ON recordings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recordings_update" ON recordings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "recordings_delete" ON recordings FOR DELETE TO authenticated USING (true);

-- Evening reviews: Allow all operations for authenticated users
CREATE POLICY "evening_reviews_select" ON evening_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "evening_reviews_insert" ON evening_reviews FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "evening_reviews_update" ON evening_reviews FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "evening_reviews_delete" ON evening_reviews FOR DELETE TO authenticated USING (true);

-- Energy logs: Allow all operations for authenticated users
CREATE POLICY "energy_logs_select" ON energy_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "energy_logs_insert" ON energy_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "energy_logs_delete" ON energy_logs FOR DELETE TO authenticated USING (true);

-- Leads: Allow all operations for authenticated users
CREATE POLICY "leads_select" ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert" ON leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leads_update" ON leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leads_delete" ON leads FOR DELETE TO authenticated USING (true);

-- Copilot messages: Allow all operations for authenticated users
CREATE POLICY "copilot_messages_select" ON copilot_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "copilot_messages_insert" ON copilot_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "copilot_messages_delete" ON copilot_messages FOR DELETE TO authenticated USING (true);

-- Audit logs: Read-only for authenticated users
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated USING (true);

-- App events: Read and insert for authenticated users
CREATE POLICY "app_events_select" ON app_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_events_insert" ON app_events FOR INSERT TO authenticated WITH CHECK (true);

-- Password reset tokens: Allow operations
CREATE POLICY "password_reset_tokens_select" ON password_reset_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "password_reset_tokens_insert" ON password_reset_tokens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "password_reset_tokens_update" ON password_reset_tokens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Registry entries: Allow all for authenticated users
CREATE POLICY "registry_entries_select" ON registry_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_entries_insert" ON registry_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "registry_entries_update" ON registry_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "registry_entries_delete" ON registry_entries FOR DELETE TO authenticated USING (true);

-- Approval requests: Allow all for authenticated users
CREATE POLICY "approval_requests_select" ON approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "approval_requests_insert" ON approval_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "approval_requests_update" ON approval_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Kill switches: Allow all for authenticated users
CREATE POLICY "kill_switches_select" ON kill_switches FOR SELECT TO authenticated USING (true);
CREATE POLICY "kill_switches_update" ON kill_switches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Tenant quotas: Allow read for authenticated users
CREATE POLICY "tenant_quotas_select" ON tenant_quotas FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenant_quotas_update" ON tenant_quotas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Member invitations: Allow all for authenticated users
CREATE POLICY "member_invitations_select" ON member_invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "member_invitations_insert" ON member_invitations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "member_invitations_update" ON member_invitations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
