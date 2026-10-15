import { emitClientLog } from '../../observability/client-logger';

export type AuthLoginDebugEvent =
  | 'auth.response.received'
  | 'auth.adapter.selected'
  | 'auth.runtime.before'
  | 'auth.runtime.after'
  | 'auth.redirect.start'
  | 'auth.redirect.end';

declare global {
  interface Window {
    __xmtAuthGrayBrowserObserver?: boolean;
  }
}

/**
 * Development/test-only trace for diagnosing the login state transition.
 * Callers must pass only flow metadata: this helper must never receive tokens,
 * cookies, passwords, or session secrets.
 */
export function emitAuthLoginDebugTrace(
  event: AuthLoginDebugEvent,
  metadata: Readonly<Record<string, boolean | number | string | null>> = {},
): void {
  const observedByFixture = typeof window !== 'undefined' && window.__xmtAuthGrayBrowserObserver === true;
  const env = import.meta.env ?? {};
  if (!env.DEV && env.MODE !== 'test' && !observedByFixture) return;
  const status = metadata.status;
  emitClientLog({
    event: 'auth.login_trace',
    level: 'debug',
    fields: {
      authEvent: event,
      mode: metadata.mode,
      status: typeof status === 'string' ? status : undefined,
      httpStatus: typeof status === 'number' ? status : metadata.httpStatus,
      responseKind: metadata.responseKind,
      hasRequestId: Boolean(metadata.requestId),
      hasLoginAttemptId: Boolean(metadata.loginAttemptId),
      hasAccessToken: metadata.hasAccessToken,
      loginCompleted: metadata.loginCompleted,
      hasUserId: metadata.hasUserId,
    },
  });
}
