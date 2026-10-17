// Resolves the backend address. NEXT_PUBLIC_* values are inlined at build time.
//  - NEXT_PUBLIC_API_URL   : full base URL (highest priority)
//  - NEXT_PUBLIC_API_MODE  : "same-origin" when a reverse proxy serves both UI and API
//  - NEXT_PUBLIC_API_PORT  : backend port on the same host (default 5000)

const envUrl = process.env.NEXT_PUBLIC_API_URL;
const envMode = process.env.NEXT_PUBLIC_API_MODE;
const envPort = process.env.NEXT_PUBLIC_API_PORT;

export function getApiBase(): string {
  if (envUrl) return envUrl.replace(/\/$/, '');
  const port = envPort || '5000';
  if (typeof window === 'undefined') return `http://localhost:${port}`;
  if (envMode === 'same-origin') return window.location.origin;
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

const TOKEN_KEY = 'nexus_admin_token';

export function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, { ...init, signal, cache: 'no-store' });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const apiGet = <T,>(path: string, signal?: AbortSignal) => request<T>(path, undefined, signal);

export const apiPost = <T,>(path: string) => {
  const token = getAdminToken();
  return request<T>(path, { method: 'POST', headers: token ? { 'x-admin-token': token } : {} });
};
