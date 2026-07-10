import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, LogOut, ShieldAlert, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications-panel";
import { useOffline } from "@/hooks/useOffline";
import { isShellRouteActive, shellNavGroups } from "./nav-model";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

type ProviderStatus = {
  configured?: boolean;
  providers?: string[];
  primary?: string | null;
  hint?: string | null;
};

type PermissionAction = {
  actionId?: string;
  humanApprovalRequired?: boolean;
  riskLevel?: string;
};

type PermissionActionsResponse = {
  ok?: boolean;
  actions?: PermissionAction[];
};

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return payload as T;
}

function ProviderPill({ status }: { status: ProviderStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
        <WifiOff className="h-3 w-3" /> provider inconnu
      </span>
    );
  }

  const configured = Boolean(status.configured);
  const providers = status.providers ?? [];
  return (
    <span
      title={status.hint ?? (providers.join(", ") || "Aucun provider configuré")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px]",
        configured
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200",
      )}
    >
      {configured ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {configured ? `provider: ${status.primary ?? providers[0] ?? "configuré"}` : "provider: missing_config"}
    </span>
  );
}

function ApprovalCountBadge({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
      {count}
    </span>
  );
}

export function GlobalSidebar() {
  const [location] = useLocation();
  const { isOnline, isSyncing, queueLength, syncQueue } = useOffline();
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [approvalCount, setApprovalCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    readJson<ProviderStatus>("/api/system/ai", controller.signal)
      .then(setProviderStatus)
      .catch(() => setProviderStatus({ configured: false, providers: [], primary: null, hint: "Statut provider indisponible" }));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    readJson<PermissionActionsResponse>("/api/permissions/actions", controller.signal)
      .then((payload) => {
        const actions = payload.actions ?? [];
        setApprovalCount(actions.filter((action) => action.humanApprovalRequired || action.riskLevel === "high").length);
      })
      .catch(() => setApprovalCount(null));
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => shellNavGroups, []);

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/personal-access/logout`, { method: "POST" });
    } finally {
      window.location.assign("/personal-access");
    }
  }

  return (
    <aside
      data-testid="global-sidebar"
      className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
      aria-label="Navigation globale TAMS"
    >
      <div className="border-b border-sidebar-border px-5 pb-5 pt-7">
        <div className="flex items-center justify-between gap-3">
          <Link href="/today">
            <button className="flex min-h-[44px] items-center gap-2.5 text-left">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <span className="text-xs font-bold">T</span>
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">TAMS</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">AI OS</div>
              </div>
            </button>
          </Link>
          <NotificationBell />
        </div>
        <div className="mt-3">
          <ProviderPill status={providerStatus} />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Sections TAMS">
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isShellRouteActive(location, item);
                const showApprovalBadge = item.href === "/approvals";
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      data-testid={`global-nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {showApprovalBadge ? <ApprovalCountBadge count={approvalCount} /> : null}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        className="space-y-2 border-t border-sidebar-border px-5 py-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="text-xs font-medium text-amber-200">Mode hors ligne</span>
            {queueLength > 0 ? <span className="ml-auto text-[10px] text-amber-200/70">{queueLength}</span> : null}
          </div>
        )}
        {isOnline && queueLength > 0 && (
          <button
            onClick={syncQueue}
            disabled={isSyncing}
            className="w-full rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-left text-xs font-medium text-blue-300"
          >
            {isSyncing ? "Synchronisation..." : `Synchroniser (${queueLength})`}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex min-h-[42px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </aside>
  );
}

