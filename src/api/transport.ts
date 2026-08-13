import { getApiBaseUrl } from '@/platform/runtime';

export const apiUrl = (path: string) => `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiFetch(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(apiUrl(path), { credentials: 'include', ...init, signal: init.signal ?? controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}
