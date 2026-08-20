/** Legacy API 401 recovery. V1 api-client owns its own refresh flow. */
import { refreshNativeSession } from '@/auth/native/native-auth-runtime';
import { webAuthRuntime } from '@/auth/web/web-auth-runtime';
import { getApiBaseUrl, isNative } from '@/platform/runtime';
import { useAuthStore } from '@/store';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export type ApiInterceptorDependencies = {
  native: () => boolean;
  apiBaseUrl: () => string;
  refreshWeb: () => Promise<string | null>;
  refreshNative: () => Promise<string | null>;
  updateAccessToken: (token: string) => void;
  expireSession: () => void;
  origin: string;
};

function productionDependencies(): ApiInterceptorDependencies {
  return {
    native: isNative,
    apiBaseUrl: getApiBaseUrl,
    refreshWeb: () => webAuthRuntime.refresh(),
    refreshNative: refreshNativeSession,
    updateAccessToken: (token) => {
      const state = useAuthStore.getState();
      if (state.user && state.authMode === 'v1-web') state.loginV1(state.user, token);
    },
    expireSession: () => {
      useAuthStore.getState().logout();
      window.dispatchEvent(new CustomEvent('xmt-auth-expired', { detail: { message: '登录已过期，请重新登录' } }));
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    },
    origin: window.location.origin,
  };
}

function resolveRuntimeRequest(input: FetchInput, native: boolean, apiBaseUrl: string): FetchInput {
  if (!native || typeof input !== 'string' || !input.startsWith('/api')) return input;
  return `${apiBaseUrl}${input.slice('/api'.length)}`;
}

function isRecoverableLegacyApi(request: Request, dependencies: ApiInterceptorDependencies) {
  if (!request.url.startsWith(dependencies.origin) && !(dependencies.native() && request.url.startsWith(dependencies.apiBaseUrl()))) return false;
  const path = new URL(request.url).pathname;
  return path.startsWith('/api/')
    && !path.startsWith('/api/v1/')
    && !['/api/auth/login', '/api/auth/logout', '/api/auth/refresh', '/api/v1/auth/refresh', '/api/v1/auth/mobile/refresh'].includes(path);
}

function requestWithNewBearer(request: Request, accessToken: string) {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return new Request(request, { headers });
}

/**
 * Builds the actual first request once. Retrying that exact Request preserves
 * Request+init method, body, credentials, signal and all other effective init overrides.
 */
export function createApiFetchInterceptor(originalFetch: typeof fetch, dependencies = productionDependencies()) {
  let hasExpired = false;
  return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const native = dependencies.native();
    const resolved = resolveRuntimeRequest(input, native, dependencies.apiBaseUrl());
    const effectiveRequest = new Request(resolved, init);
    try {
      const response = await originalFetch(effectiveRequest.clone());
      if (response.status !== 401 || !isRecoverableLegacyApi(effectiveRequest, dependencies)) return response;

      const token = await (native ? dependencies.refreshNative() : dependencies.refreshWeb());
      if (token) {
        dependencies.updateAccessToken(token);
        return originalFetch(requestWithNewBearer(effectiveRequest, token));
      }
      if (!hasExpired) { hasExpired = true; dependencies.expireSession(); }
      return response;
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        window.dispatchEvent(new CustomEvent('xmt-network-error', { detail: { message: '网络连接失败，请检查网络' } }));
      }
      throw error;
    }
  };
}

const originalFetch = window.fetch.bind(window);
window.fetch = createApiFetchInterceptor(originalFetch);
window.addEventListener('xmt-auth-expired', ((event: CustomEvent) => console.warn('[API]', event.detail.message)) as EventListener);
window.addEventListener('xmt-network-error', ((event: CustomEvent) => console.warn('[API]', event.detail.message)) as EventListener);
