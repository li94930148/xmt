import { AuthRuntime } from '../runtime/auth-runtime';
import type { AuthLoginResult } from './login-response-adapter';
import { toAuthV1User } from './login-response-adapter';

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
  webAuthRuntime.authenticate(toAuthV1User(result.user), result.accessToken);
  if (typeof window !== 'undefined') {
    window.__xmtAuthRuntime = {
      getAccessToken: () => webAuthRuntime.getAccessToken(),
      refresh: () => webAuthRuntime.refresh(),
      getExpiresAt,
    };
  }
}
