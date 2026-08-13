import type { NextFunction, Request, Response } from 'express';

const FORWARDING_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
] as const;

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * Internal diagnostics are intentionally available only to a process that made
 * a direct local TCP connection. Caddy reaches Node through loopback too, so a
 * socket address by itself is not sufficient evidence of a direct request.
 */
export function isDirectLoopbackRequest(request: Pick<Request, 'socket' | 'headers'>): boolean {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
  return !FORWARDING_HEADERS.some((header) => {
    const value = request.headers[header];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0;
  });
}

/** Return 404 so a proxied or public caller cannot confirm an internal route exists. */
export function requireDirectLoopback(request: Request, response: Response, next: NextFunction): void {
  if (!isDirectLoopbackRequest(request)) {
    response.status(404).end();
    return;
  }
  next();
}
