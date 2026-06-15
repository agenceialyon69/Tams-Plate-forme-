const STORAGE_KEY = "kore_api_token";

let listeners: Array<() => void> = [];

export function getToken(): string | null {
  try {
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
