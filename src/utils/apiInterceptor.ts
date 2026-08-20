/** Legacy API 401 recovery. V1 api-client owns its own refresh flow. */
import { refreshNativeSession } from '@/auth/native/native-auth-runtime';
import { webAuthRuntime } from '@/auth/web/web-auth-runtime';
import { getApiBaseUrl, isNative } from '@/platform/runtime';
import { useAuthStore } from '@/store';

let isRedirecting = false;
const originalFetch = window.fetch.bind(window);

function resolveRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function resolveRuntimeRequest(input: Parameters<typeof fetch>[0]): Parameters<typeof fetch>[0] {
  if (!isNative() || typeof input !== 'string' || !input.startsWith('/api')) return input;
  return `${getApiBaseUrl()}${input.slice('/api'.length)}`;
}

function requestPath(url: string) {
  try { return new URL(url, window.location.origin).pathname; } catch { return ''; }
}

function isLegacyXmtApiRequest(url: string) {
  const path = requestPath(url);
  if (!path.startsWith('/api/') || path.startsWith('/api/v1/')) return false;
  if (isNative()) return url.startsWith(getApiBaseUrl()) || url.startsWith('/api/');
  try { return new URL(url, window.location.origin).origin === window.location.origin; } catch { return false; }
}

function canRecover401(url: string) {
  const path = requestPath(url);
  return isLegacyXmtApiRequest(url) && !['/api/auth/login', '/api/auth/logout', '/api/v1/auth/refresh', '/api/v1/auth/mobile/refresh'].includes(path);
}

async function recoverAccessToken(): Promise<string | null> {
  const token = isNative() ? await refreshNativeSession() : await webAuthRuntime.refresh();
  if (!token) return null;
  const state = useAuthStore.getState();
  if (state.user && state.authMode === 'v1-web') state.loginV1(state.user, token);
  return token;
}

function retryWithFreshToken(input: Parameters<typeof fetch>[0], init: RequestInit | undefined, accessToken: string) {
  if (input instanceof Request) {
    const headers = new Headers(input.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return originalFetch(new Request(input, { headers }));
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return originalFetch(input, { ...init, headers });
}

function expireSession() {
  if (isRedirecting) return;
  isRedirecting = true;
  useAuthStore.getState().logout();
  window.dispatchEvent(new CustomEvent('xmt-auth-expired', { detail: { message: '登录已过期，请重新登录' } }));
  setTimeout(() => { window.location.href = '/login'; isRedirecting = false; }, 1500);
}

window.fetch = async function (input, init): Promise<Response> {
  try {
    const request = resolveRuntimeRequest(input);
    const requestUrl = resolveRequestUrl(request);
    const retryInput = request instanceof Request ? request.clone() : request;
    const response = await originalFetch(request instanceof Request ? request.clone() : request, init);
    if (response.status !== 401 || !canRecover401(requestUrl)) return response;

    const accessToken = await recoverAccessToken();
    if (accessToken) return retryWithFreshToken(retryInput, init, accessToken);
    expireSession();
    return response;
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      window.dispatchEvent(new CustomEvent('xmt-network-error', { detail: { message: '网络连接失败，请检查网络' } }));
    }
    throw error;
  }
};

window.addEventListener('xmt-auth-expired', ((event: CustomEvent) => console.warn('[API]', event.detail.message)) as EventListener);
window.addEventListener('xmt-network-error', ((event: CustomEvent) => console.warn('[API]', event.detail.message)) as EventListener);

export {};
