import { mobileRefresh } from '@/api';
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
};

declare global {
  interface Window {
    __xmtAuthRuntime?: NativeAuthRuntime;
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
  let refreshInFlight: Promise<string | null> | null = null;

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
        return next.accessToken;
      } catch {
        await dependencies.clearRefreshToken().catch(() => undefined);
        dependencies.clearUser();
        dependencies.logout();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
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
  return () => {
    if (window.__xmtAuthRuntime === installedRuntime) delete window.__xmtAuthRuntime;
  };
}
