const STORAGE_KEY = "tams_auth_token";
const USER_KEY = "tams_auth_user";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
  tenantId: number;
  tenantSlug: string;
  tenantName?: string;
}

let listeners: Array<() => void> = [];

export function getToken(): string | null {
  try {
    // Migrate tokens from any legacy key names
    const legacy =
      localStorage.getItem("gandal_auth_token") ??
      localStorage.getItem("tams_api_token") ??
      localStorage.getItem("kore_api_token");
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem("gandal_auth_token");
      localStorage.removeItem("tams_api_token");
      localStorage.removeItem("kore_api_token");
    }
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token.trim());
  } catch { }
  listeners.forEach((fn) => fn());
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("gandal_auth_token");
    localStorage.removeItem("gandal_auth_user");
    localStorage.removeItem("tams_api_token");
    localStorage.removeItem("kore_api_token");
  } catch { }
  listeners.forEach((fn) => fn());
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch { }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function onAuthChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
