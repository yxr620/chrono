import { useAuthStore } from '../stores/authStore';

const API = import.meta.env.VITE_AUTH_API_URL ?? '';

export interface DeviceRecord {
  deviceId: string;
  namespace: string;
  lastSeenAt: string;
  snapshotBytes: number;
  oplogCount: number;
  oplogBytes: number;
  stale: boolean;
}

export interface StorageInfo {
  totalBytes: number;
  breakdown: { namespace: string; bytes: number }[];
}

async function authFetch(path: string, init: RequestInit = {}) {
  if (!API) throw new Error('VITE_AUTH_API_URL not set');
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('not_authenticated');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'http_' + res.status }));
    throw new Error(err.error ?? 'request_failed');
  }
  return res.json();
}

export const userDataService = {
  listDevices: () => authFetch('/me/devices') as Promise<{ devices: DeviceRecord[] }>,
  removeDevice: (deviceId: string) =>
    authFetch(`/me/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
  getStorage: () => authFetch('/me/storage') as Promise<StorageInfo>,
  deleteAccount: (confirmEmail: string) =>
    authFetch('/me/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmEmail }),
    }) as Promise<{ ok: true }>,
};
