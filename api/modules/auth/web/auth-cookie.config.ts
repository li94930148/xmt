import type { CookieOptions, Response } from 'express';

export const AUTH_REFRESH_COOKIE_NAME = '__Host-xmt_refresh';
export const AUTH_CSRF_COOKIE_NAME = '__Host-xmt_csrf';

export type AuthCookieConfig = {
  secure: boolean;
};

export function createAuthCookieOptions(
  config: AuthCookieConfig,
  maxAgeMs?: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    path: '/',
    ...(maxAgeMs === undefined ? {} : { maxAge: Math.max(0, maxAgeMs) }),
  };
}

export function setAuthRefreshCookie(
  response: Pick<Response, 'cookie'>,
  refreshToken: string,
  config: AuthCookieConfig,
  maxAgeMs?: number,
): void {
  response.cookie(AUTH_REFRESH_COOKIE_NAME, refreshToken, createAuthCookieOptions(config, maxAgeMs));
}

export function clearAuthRefreshCookie(
  response: Pick<Response, 'cookie'>,
  config: AuthCookieConfig,
): void {
  response.cookie(AUTH_REFRESH_COOKIE_NAME, '', {
    ...createAuthCookieOptions(config, 0),
    expires: new Date(0),
  });
}

export function setAuthCsrfCookie(
  response: Pick<Response, 'cookie'>,
  csrfToken: string,
  config: AuthCookieConfig,
): void {
  response.cookie(AUTH_CSRF_COOKIE_NAME, csrfToken, {
    ...createAuthCookieOptions(config),
    httpOnly: false,
  });
}

export function clearAuthCsrfCookie(
  response: Pick<Response, 'cookie'>,
  config: AuthCookieConfig,
): void {
  response.cookie(AUTH_CSRF_COOKIE_NAME, '', {
    ...createAuthCookieOptions(config, 0),
    httpOnly: false,
    expires: new Date(0),
  });
}
