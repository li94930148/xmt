import type { CookieOptions, Response } from 'express';

export const AUTH_REFRESH_COOKIE_NAME = '__Host-xmt_refresh';

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
  response: Pick<Response, 'clearCookie'>,
  config: AuthCookieConfig,
): void {
  response.clearCookie(AUTH_REFRESH_COOKIE_NAME, createAuthCookieOptions(config));
}
