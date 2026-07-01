function getSupabaseStorageKey(): string | null {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!rawUrl) return null;
  try {
    const projectRef = new URL(rawUrl).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

/**
 * Reuses the session persisted by the existing Supabase frontend client.
 * The runtime bridge neither creates nor refreshes credentials; the backend
 * remains the authority that validates the Bearer JWT.
 */
export async function getRuntimeAccessToken(): Promise<string | null> {
  const key = getSupabaseStorageKey();
  if (!key) return null;

  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as {
      access_token?: unknown;
      currentSession?: { access_token?: unknown };
    };
    const token = session.access_token ?? session.currentSession?.access_token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}
