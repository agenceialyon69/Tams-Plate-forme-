const STORAGE_KEY = "tams_api_token";

let listeners: Array<() => void> = [];

export function getToken(): string | null {
  try {
    // Migrate from old key if needed
    const old = localStorage.getItem("kore_api_token");
    if (old) {
      localStorage.setItem(STORAGE_KEY, old);
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
  } catch {
    /* ignore storage errors */
  }
  listeners.forEach((fn) => fn());
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("kore_api_token"); // cleanup legacy key
  } catch {
    /* ignore storage errors */
  }
  listeners.forEach((fn) => fn());
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/** Subscribe to token changes (login / logout). Returns an unsubscribe fn. */
export function onAuthChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
