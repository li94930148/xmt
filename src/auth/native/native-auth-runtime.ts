import { mobileRefresh, MobileRefreshError } from '@/api/auth';
import { useAuthStore } from '@/store';
import { nativeRefreshCredentials, nativeUserProfile } from './secure-credentials';

export type NativeAuthTrace = {
  mode: string;
  status: string;
  loginCompleted: boolean;
  hasAccessToken: boolean;
};

export type NativeAuthRuntime = {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
  getExpiresAt: () => number | null;
  getTraceSnapshot: () => NativeAuthTrace;
  start: () => void;
  stop: () => void;
  onAccessTokenChanged: () => void;
  onResume: () => Promise<string | null>;
  onNetworkOnline: () => Promise<string | null>;
};

export type NativeAuthRuntimeDependencies = {
  getAccessToken: () => string | null;
  getUser: () => ReturnType<typeof nativeUserProfile.get>;
  getRefreshToken: () => Promise<string | null>;
  setRefreshToken: (token: string) => Promise<void>;
  clearRefreshToken: () => Promise<void>;
  clearUser: () => void;
  login: (user: NonNullable<ReturnType<typeof nativeUserProfile.get>>, token: string) => void;
  logout: () => void;
  refreshRequest: typeof mobileRefresh;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  refreshLeadMs?: number;
  retryBaseMs?: number;
  maxTransientRetries?: number;
};

declare global {
  interface Window {
    __xmtAuthRuntime?: Omit<NativeAuthRuntime, 'start' | 'stop' | 'onAccessTokenChanged' | 'onResume' | 'onNetworkOnline'>
      & Partial<Pick<NativeAuthRuntime, 'start' | 'stop' | 'onAccessTokenChanged' | 'onResume' | 'onNetworkOnline'>>;
  }
}

export function readAccessTokenExpiry(token: string | null) {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Creates one refresh queue so app-resume and Socket reconnect never rotate twice. */
export function createNativeAuthRuntime(dependencies: NativeAuthRuntimeDependencies): NativeAuthRuntime {
  const MAX_TIMER_DELAY_MS = 2_147_000_000;
  let refreshInFlight: Promise<string | null> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let transientRetries = 0;
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer));
  const refreshLeadMs = dependencies.refreshLeadMs ?? 60_000;
  const retryBaseMs = dependencies.retryBaseMs ?? 30_000;
  const maxTransientRetries = dependencies.maxTransientRetries ?? 3;

  const clearRefreshTimer = () => {
    if (refreshTimer) clearTimer(refreshTimer);
    refreshTimer = null;
  };
  const schedule = (delay: number) => {
    clearRefreshTimer();
    refreshTimer = setTimer(() => { refreshTimer = null; void ensureFreshToken(); }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, delay)));
  };
  const scheduleForCurrentToken = () => {
    clearRefreshTimer();
    const expiry = readAccessTokenExpiry(dependencies.getAccessToken());
    if (!expiry) return;
    const delay = expiry - now() - refreshLeadMs;
    if (delay <= 0) { void ensureFreshToken(); return; }
    schedule(delay);
  };
  const isTerminal = (error: unknown) => error instanceof MobileRefreshError && error.terminal;

  const refresh = () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const refreshToken = await dependencies.getRefreshToken();
      const user = dependencies.getUser();
      if (!refreshToken || !user) return null;
      try {
        const next = await dependencies.refreshRequest(refreshToken);
        await dependencies.setRefreshToken(next.refreshToken);
        dependencies.login(user, next.accessToken);
        transientRetries = 0;
        scheduleForCurrentToken();
        return next.accessToken;
      } catch (error) {
        if (isTerminal(error)) {
          clearRefreshTimer();
          await dependencies.clearRefreshToken().catch(() => undefined);
          dependencies.clearUser();
          dependencies.logout();
        } else if (transientRetries < maxTransientRetries) {
          transientRetries += 1;
          schedule(retryBaseMs * 2 ** (transientRetries - 1));
        }
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  };

  const ensureFreshToken = () => {
    const expiry = readAccessTokenExpiry(dependencies.getAccessToken());
    if (!expiry || expiry - now() <= refreshLeadMs) return refresh();
    scheduleForCurrentToken();
    return Promise.resolve(dependencies.getAccessToken());
  };

  return {
    getAccessToken: dependencies.getAccessToken,
    refresh,
    getExpiresAt: () => readAccessTokenExpiry(dependencies.getAccessToken()),
    getTraceSnapshot: () => {
      const accessToken = dependencies.getAccessToken();
      return {
        mode: 'android-native',
        status: accessToken ? 'authenticated' : 'anonymous',
        loginCompleted: Boolean(accessToken),
        hasAccessToken: Boolean(accessToken),
      };
    },
    start: scheduleForCurrentToken,
    stop: clearRefreshTimer,
    onAccessTokenChanged: () => { transientRetries = 0; scheduleForCurrentToken(); },
    onResume: ensureFreshToken,
    onNetworkOnline: ensureFreshToken,
  };
}

let installedRuntime: NativeAuthRuntime | null = null;

function runtimeDependencies(): NativeAuthRuntimeDependencies {
  return {
    getAccessToken: () => useAuthStore.getState().token,
    getUser: () => nativeUserProfile.get() ?? useAuthStore.getState().user,
    getRefreshToken: () => nativeRefreshCredentials.get(),
    setRefreshToken: (token) => nativeRefreshCredentials.set(token),
    clearRefreshToken: () => nativeRefreshCredentials.clear(),
    clearUser: () => nativeUserProfile.clear(),
    login: (user, token) => useAuthStore.getState().loginV1(user, token),
    logout: () => useAuthStore.getState().logout(),
    refreshRequest: mobileRefresh,
  };
}

export function refreshNativeSession() {
  if (!installedRuntime) installedRuntime = createNativeAuthRuntime(runtimeDependencies());
  return installedRuntime.refresh();
}

export function installNativeAuthRuntime() {
  if (!installedRuntime) installedRuntime = createNativeAuthRuntime(runtimeDependencies());
  window.__xmtAuthRuntime = installedRuntime;
  installedRuntime.start();
  const onResume = () => { void installedRuntime?.onResume(); };
  const onNetwork = (event: Event) => {
    if ((event as CustomEvent<{ connected?: boolean }>).detail?.connected) void installedRuntime?.onNetworkOnline();
  };
  window.addEventListener('xmt-app-resume', onResume);
  window.addEventListener('xmt-network-status', onNetwork);
  const unsubscribe = useAuthStore.subscribe((state, previous) => {
    if (state.token !== previous.token) installedRuntime?.onAccessTokenChanged();
    if (!state.isLoggedIn) installedRuntime?.stop();
  });
  return () => {
    window.removeEventListener('xmt-app-resume', onResume);
    window.removeEventListener('xmt-network-status', onNetwork);
    unsubscribe();
    installedRuntime?.stop();
    if (window.__xmtAuthRuntime === installedRuntime) delete window.__xmtAuthRuntime;
  };
}
