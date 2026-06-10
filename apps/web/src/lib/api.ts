const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Resolve a stored message mediaUrl to something a media tag can load.
 * `/media/<file>` (inbound media saved by the gateway) is served by the API;
 * absolute http(s) URLs (admin-sent media) pass through; anything else —
 * including legacy WhatsApp key-id placeholders — is not renderable.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/media/')) return `${API_URL}${url}`;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return null;
}

const TOKEN_KEY = 'hermes_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** Decode the role claim from the stored JWT (display gating only — the API enforces auth). */
export function getRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1])).role ?? null;
  } catch {
    return null;
  }
}

const roleHierarchy: Record<string, number> = {
  owner: 4,
  supervisor: 3,
  admin: 2,
  viewer: 1,
};

/** True when the current user's role meets or exceeds the required role. */
export function hasRole(required: string): boolean {
  const role = getRole();
  if (!role) return false;
  return (roleHierarchy[role] ?? 0) >= (roleHierarchy[required] ?? 0);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
