import { supabase } from "./supabase";
import type { Capability, Approval, AuditEntry } from "./supabase-types";

export type { Capability, Approval, AuditEntry };

export async function listCapabilities(): Promise<Capability[]> {
  const { data, error } = await supabase
    .from("capabilities")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function grantCapability(input: {
  scope: string;
  resource?: string;
  reason?: string;
  expiresInMinutes?: number;
}): Promise<Capability> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const expires_at = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000).toISOString()
    : null;

  const { data: row, error } = await supabase
    .from("capabilities")
    .insert({
      user_id: user.id,
      scope: input.scope,
      resource: input.resource ?? null,
      reason: input.reason ?? null,
      granted_by: user.id,
      expires_at,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    kind: "capability.grant",
    subject: input.scope,
    payload: { id: row.id, resource: input.resource, expires_at },
  });

  return row;
}

export async function revokeCapability(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("capabilities")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    kind: "capability.revoke",
    subject: id,
    payload: {},
  });
}

export async function listApprovals(): Promise<Approval[]> {
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("approvals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    kind: "approval.decide",
    subject: id,
    payload: { decision },
  });
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}
