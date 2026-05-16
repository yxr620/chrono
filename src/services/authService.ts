const API = import.meta.env.VITE_AUTH_API_URL ?? '';

interface AuthResponse {
  token: string;
  user: { id: string; email: string };
}

interface StsResponse {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
}

export interface FeatureFlags {
  sync: boolean;
  ai: boolean;
  aiModel?: string;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  if (!API) throw new Error('VITE_AUTH_API_URL not set');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'http_' + res.status }));
    throw new Error(err.error ?? 'request_failed');
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string, token: string): Promise<T> {
  if (!API) throw new Error('VITE_AUTH_API_URL not set');
  const res = await fetch(`${API}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'http_' + res.status }));
    throw new Error(err.error ?? 'request_failed');
  }
  return res.json() as Promise<T>;
}

export const authService = {
  register: (email: string, password: string) =>
    post<AuthResponse>('/auth/register', { email, password }),
  login: (email: string, password: string) =>
    post<AuthResponse>('/auth/login', { email, password }),
  getStsToken: (token: string) =>
    post<StsResponse>('/auth/sts', {}, token),
  getFeatureFlags: (token: string) =>
    get<FeatureFlags>('/me/features', token),
};
