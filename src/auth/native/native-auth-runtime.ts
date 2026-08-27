import { mobileRefresh, MobileRefreshError, type MobileRefreshResult } from '@/api/auth';
import { useAuthStore } from '@/store';
import { nativeRefreshCredentials, nativeUserProfile } from './secure-credentials';

export type NativeAuthTrace = {
  mode: string;
  status: string;
  loginCompleted: boolean;
  hasAccessToken: boolean;
  schedulerArmed: boolean;
  expirySource: 'server_expires_in' | 'jwt_exp_fallback' | 'unknown';
  expiryParseStatus: 'not_needed' | 'parsed' | 'failed';
  expiresAt: number | null;
  refreshDueAt: number | null;
  remainingMs: number | null;
  lastScheduledAt: number | null;
  lastTriggerSource: 'login' | 'refresh' | 'timer' | 'resume' | 'network' | 'store_fallback' | null;
  lastRefreshAttemptAt: number | null;
  lastRefreshResult: 'success' | 'transient_failure' | 'terminal_failure' | null;
  successfulRefreshCount: number;
  transientRetryCount: number;
};

export type NativeTokenLifetime = { expiresInSeconds: number; issuedAtMs?: number };

export type NativeAuthRuntime = {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
  getExpiresAt: () => number | null;
  getTraceSnapshot: () => NativeAuthTrace;
  start: () => void;
  stop: () => void;
  onAccessTokenChanged: () => void;
  onTokenIssued: (lifetime: NativeTokenLifetime, source?: 'login' | 'refresh') => void;
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
  refreshRequest: (refreshToken: string) => Promise<MobileRefreshResult>;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  refreshLeadMs?: number;
  retryBaseMs?: number;
  maxTransientRetries?: number;
};

declare global {
  interface Window {
    __xmtAuthRuntime?: Pick<NativeAuthRuntime, 'getAccessToken' | 'refresh' | 'getExpiresAt'>
      & { getTraceSnapshot: () => unknown }
      & Partial<Pick<NativeAuthRuntime, 'start' | 'stop' | 'onAccessTokenChanged' | 'onTokenIssued' | 'onResume' | 'onNetworkOnline'>>;
  }
}

export function readAccessTokenExpiry(token: string | null) {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - base64.length % 4) % 4)}`;
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown };
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
  let scheduleGeneration = 0;
  let expiresAtMs: number | null = null;
  let expirySource: NativeAuthTrace['expirySource'] = 'unknown';
  let expiryParseStatus: NativeAuthTrace['expiryParseStatus'] = 'not_needed';
  let lastScheduledAt: number | null = null;
  let lastTriggerSource: NativeAuthTrace['lastTriggerSource'] = null;
  let lastRefreshAttemptAt: number | null = null;
  let lastRefreshResult: NativeAuthTrace['lastRefreshResult'] = null;
  let successfulRefreshCount = 0;
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer));
  const refreshLeadMs = dependencies.refreshLeadMs ?? 60_000;
  const retryBaseMs = dependencies.retryBaseMs ?? 30_000;
  const maxTransientRetries = dependencies.maxTransientRetries ?? 3;

  const clearRefreshTimer = () => {
    if (refreshTimer) clearTimer(refreshTimer);
    refreshTimer = null;
    scheduleGeneration += 1;
  };
  const schedule = (delay: number) => {
    clearRefreshTimer();
    const generation = scheduleGeneration;
    lastScheduledAt = now();
    refreshTimer = setTimer(() => {
      if (generation !== scheduleGeneration) return;
      refreshTimer = null;
      lastTriggerSource = 'timer';
      void ensureFreshToken();
    }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, delay)));
  };
  const clearLifetime = () => {
    clearRefreshTimer();
    expiresAtMs = null;
    expirySource = 'unknown';
    expiryParseStatus = 'not_needed';
  };
  const scheduleForExpiry = () => {
    clearRefreshTimer();
    if (!expiresAtMs) return;
    const delay = expiresAtMs - now() - refreshLeadMs;
    if (delay <= 0) { void ensureFreshToken(); return; }
    schedule(delay);
  };
  const scheduleFromJwtFallback = () => {
    const expiry = readAccessTokenExpiry(dependencies.getAccessToken());
    if (!expiry) {
      expirySource = 'unknown';
      expiryParseStatus = 'failed';
      clearRefreshTimer();
      return;
    }
    expiresAtMs = expiry;
    expirySource = 'jwt_exp_fallback';
    expiryParseStatus = 'parsed';
    scheduleForExpiry();
  };
  const isTerminal = (error: unknown) => error instanceof MobileRefreshError && error.terminal;

  const refresh = () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const refreshToken = await dependencies.getRefreshToken();
      const user = dependencies.getUser();
      if (!refreshToken || !user) return null;
      try {
        lastRefreshAttemptAt = now();
        const next = await dependencies.refreshRequest(refreshToken);
        await dependencies.setRefreshToken(next.refreshToken);
        dependencies.login(user, next.accessToken);
        transientRetries = 0;
        successfulRefreshCount += 1;
        lastRefreshResult = 'success';
        onTokenIssued({ expiresInSeconds: next.expiresIn }, 'refresh');
        return next.accessToken;
      } catch (error) {
        if (isTerminal(error)) {
          lastRefreshResult = 'terminal_failure';
          clearLifetime();
          await dependencies.clearRefreshToken().catch(() => undefined);
          dependencies.clearUser();
          dependencies.logout();
        } else if (transientRetries < maxTransientRetries) {
          transientRetries += 1;
          lastRefreshResult = 'transient_failure';
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
    if (!dependencies.getAccessToken()) {
      clearLifetime();
      return Promise.resolve(null);
    }
    if (!expiresAtMs) scheduleFromJwtFallback();
    if (!expiresAtMs || expiresAtMs - now() <= refreshLeadMs) return refresh();
    scheduleForExpiry();
    return Promise.resolve(dependencies.getAccessToken());
  };
  const onTokenIssued = (lifetime: NativeTokenLifetime, source: 'login' | 'refresh' = 'login') => {
    const seconds = lifetime.expiresInSeconds;
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 7 * 24 * 60 * 60) {
      expirySource = 'unknown';
      expiryParseStatus = 'failed';
      clearRefreshTimer();
      return;
    }
    expiresAtMs = (lifetime.issuedAtMs ?? now()) + seconds * 1000;
    expirySource = 'server_expires_in';
    expiryParseStatus = 'not_needed';
    lastTriggerSource = source;
    scheduleForExpiry();
  };

  return {
    getAccessToken: dependencies.getAccessToken,
    refresh,
    getExpiresAt: () => expiresAtMs,
    getTraceSnapshot: () => {
      const accessToken = dependencies.getAccessToken();
      return {
        mode: 'android-native',
        status: accessToken ? 'authenticated' : 'anonymous',
        loginCompleted: Boolean(accessToken),
        hasAccessToken: Boolean(accessToken),
        schedulerArmed: refreshTimer !== null,
        expirySource,
        expiryParseStatus,
        expiresAt: expiresAtMs,
        refreshDueAt: expiresAtMs === null ? null : expiresAtMs - refreshLeadMs,
        remainingMs: expiresAtMs === null ? null : expiresAtMs - now(),
        lastScheduledAt,
        lastTriggerSource,
        lastRefreshAttemptAt,
        lastRefreshResult,
        successfulRefreshCount,
        transientRetryCount: transientRetries,
      };
    },
    start: () => { if (dependencies.getAccessToken()) scheduleFromJwtFallback(); },
    stop: clearLifetime,
    onAccessTokenChanged: () => {
      transientRetries = 0;
      lastTriggerSource = 'store_fallback';
      if (!dependencies.getAccessToken()) clearLifetime(); else scheduleFromJwtFallback();
    },
    onTokenIssued,
    onResume: () => { lastTriggerSource = 'resume'; return ensureFreshToken(); },
    onNetworkOnline: () => { lastTriggerSource = 'network'; return ensureFreshToken(); },
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

/** Explicitly binds a successful Android login to its server-issued lifetime. */
export function notifyNativeTokenIssued(lifetime: NativeTokenLifetime, source: 'login' | 'refresh' = 'login') {
  if (!installedRuntime) installedRuntime = createNativeAuthRuntime(runtimeDependencies());
  installedRuntime.onTokenIssued(lifetime, source);
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
  const onBrowserOnline = () => { void installedRuntime?.onNetworkOnline(); };
  const onVisibility = () => { if (document.visibilityState === 'visible') void installedRuntime?.onResume(); };
  window.addEventListener('online', onBrowserOnline);
  document.addEventListener('visibilitychange', onVisibility);
  const unsubscribe = useAuthStore.subscribe((state, previous) => {
    if (state.token !== previous.token) installedRuntime?.onAccessTokenChanged();
    if (!state.isLoggedIn) installedRuntime?.stop();
  });
  return () => {
    window.removeEventListener('xmt-app-resume', onResume);
    window.removeEventListener('xmt-network-status', onNetwork);
    window.removeEventListener('online', onBrowserOnline);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
    installedRuntime?.stop();
    if (window.__xmtAuthRuntime === installedRuntime) delete window.__xmtAuthRuntime;
  };
}
