/**
 * ConnectedICD — REST API client with JWT auto-attach.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers: extraHeaders, ...rest } = options;

  const url = new URL(path, API_BASE);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  // Auto-attach JWT from localStorage
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('connectedICD_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { ...rest, headers, body: body != null ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });

  if (res.status === 401) {
    // Token expired or invalid — clear and redirect to login
    if (typeof window !== 'undefined') {
      localStorage.removeItem('connectedICD_token');
      window.location.reload();
    }
  }

  if (!res.ok) {
    let msg = res.statusText;
    try { const json = await res.json(); msg = json.error?.message || json.message || json.error || msg; } catch {}
    throw new Error(`API ${res.status}: ${msg}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) => request<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
