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
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test' && !observedByFixture) return;
  console.debug(`[xmt-auth] ${event}`, metadata);
}
