import { AuthRuntime } from '../runtime/auth-runtime';
import type { AuthLoginResult } from './login-response-adapter';
import { toAuthV1User } from './login-response-adapter';
import type { User } from '../../types';

const CSRF_COOKIE_NAME = '__Host-xmt_csrf';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const item = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return null;
  }
}

function readAccessToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const accessToken = (data as { accessToken?: unknown }).accessToken;
  return typeof accessToken === 'string' && accessToken.length > 0 ? accessToken : null;
}

async function refreshWebAccessToken(): Promise<string | null> {
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  if (!csrfToken) return null;
  try {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-XMT-CSRF': csrfToken },
      body: '{}',
    });
    if (!response.ok) return null;
    return readAccessToken(await response.json());
  } catch {
    return null;
  }
}

/** Singleton used by the Web login adapter. Access tokens never leave memory. */
export const webAuthRuntime = new AuthRuntime({ refreshAccessToken: refreshWebAccessToken });

type WebLoginDiagnosticEvent =
  | 'auth.login.received'
  | 'auth.runtime.updated'
  | 'auth.redirect.started'
  | 'auth.redirect.completed';

function emitWebLoginDiagnostic(event: WebLoginDiagnosticEvent, metadata: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
  // Development-only diagnostics intentionally exclude token and cookie material.
  console.debug(`[xmt-auth] ${event}`, metadata);
}

function getExpiresAt(): number | null {
  const token = webAuthRuntime.getAccessToken();
  if (!token) return null;
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp : null;
  } catch {
    return null;
  }
}

export function activateWebAuthRuntime(result: AuthLoginResult): void {
  if (result.authMode !== 'v1-web') return;
  webAuthRuntime.beginAuthentication();
  emitWebLoginDiagnostic('auth.login.received', { mode: result.authMode, userId: result.user.id });
  webAuthRuntime.authenticate(toAuthV1User(result.user), result.accessToken);
  emitWebLoginDiagnostic('auth.runtime.updated', {
    mode: result.authMode,
    userId: result.user.id,
    status: webAuthRuntime.getState().status,
    loginCompleted: webAuthRuntime.getState().loginCompleted,
  });
  if (typeof window !== 'undefined') {
    window.__xmtAuthRuntime = {
      getAccessToken: () => webAuthRuntime.getAccessToken(),
      refresh: () => webAuthRuntime.refresh(),
      getExpiresAt,
    };
  }
}

/** Completes v1 login before the caller begins the existing route transition. */
export function completeWebLogin(
  result: AuthLoginResult,
  updateApplicationAuthState: (user: User, accessToken: string) => void,
): void {
  if (result.authMode !== 'v1-web') return;
  activateWebAuthRuntime(result);
  updateApplicationAuthState(result.user, result.accessToken);
  webAuthRuntime.beginRedirect();
  emitWebLoginDiagnostic('auth.redirect.started', {
    mode: result.authMode,
    userId: result.user.id,
    loginCompleted: webAuthRuntime.getState().loginCompleted,
  });
}

export function completeWebLoginRedirect(userId: number): void {
  emitWebLoginDiagnostic('auth.redirect.completed', {
    mode: 'v1-web',
    userId,
    status: webAuthRuntime.getState().status,
  });
}
