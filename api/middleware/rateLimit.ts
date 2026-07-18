import crypto from 'crypto';
import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';

type LimiterDimension = 'api' | 'login_ip' | 'login_account' | 'password_change';

export type RateLimitConfig = {
  api: { enabled: boolean; windowMs: number; max: number };
  loginIp: { enabled: boolean; windowMs: number; max: number };
  loginAccount: { enabled: boolean; windowMs: number; max: number };
  diagnostics: boolean;
};

const DEFAULT_CONFIG: RateLimitConfig = {
  api: { enabled: true, windowMs: 60_000, max: 1200 },
  loginIp: { enabled: true, windowMs: 5 * 60_000, max: 100 },
  loginAccount: { enabled: true, windowMs: 15 * 60_000, max: 15 },
  diagnostics: false,
};

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

export function getRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    api: { enabled: readBoolean(env.API_RATE_LIMIT_ENABLED, true), windowMs: readPositiveInteger(env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_CONFIG.api.windowMs), max: readPositiveInteger(env.API_RATE_LIMIT_MAX, DEFAULT_CONFIG.api.max) },
    loginIp: { enabled: readBoolean(env.LOGIN_IP_RATE_LIMIT_ENABLED, true), windowMs: readPositiveInteger(env.LOGIN_IP_RATE_LIMIT_WINDOW_MS, DEFAULT_CONFIG.loginIp.windowMs), max: readPositiveInteger(env.LOGIN_IP_RATE_LIMIT_MAX, DEFAULT_CONFIG.loginIp.max) },
    loginAccount: { enabled: readBoolean(env.LOGIN_ACCOUNT_RATE_LIMIT_ENABLED, true), windowMs: readPositiveInteger(env.LOGIN_ACCOUNT_RATE_LIMIT_WINDOW_MS, DEFAULT_CONFIG.loginAccount.windowMs), max: readPositiveInteger(env.LOGIN_ACCOUNT_RATE_LIMIT_MAX, DEFAULT_CONFIG.loginAccount.max) },
    diagnostics: readBoolean(env.RATE_LIMIT_DIAGNOSTICS, false),
  };
}

export function normalizeLoginUsername(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'anonymous';
}

function retryAfterSeconds(req: Request, fallbackWindowMs: number) {
  const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime?.getTime();
  return resetTime ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)) : Math.max(1, Math.ceil(fallbackWindowMs / 1000));
}

function requestId(req: Request) {
  return req.get('x-request-id')?.slice(0, 128);
}

function logRateLimitEvent(req: Request, dimension: LimiterDimension, retryAfter: number) {
  const username = normalizeLoginUsername(req.body?.username);
  console.warn('[rate-limit]', {
    timestamp: new Date().toISOString(), limiter: dimension, ip: req.ip, method: req.method, originalUrl: req.originalUrl,
    usernameHash: username === 'anonymous' ? undefined : crypto.createHash('sha256').update(username).digest('hex').slice(0, 12),
    retryAfterSeconds: retryAfter, userAgent: req.get('user-agent')?.slice(0, 200), requestId: requestId(req),
  });
}

export function logFailedLogin(req: Request, res: Response, next: NextFunction) {
  res.once('finish', () => {
    if (res.statusCode < 400 || res.statusCode === 429) return;
    const username = normalizeLoginUsername(req.body?.username);
    console.warn('[auth-login-failed]', {
      timestamp: new Date().toISOString(), ip: req.ip, method: req.method, originalUrl: req.originalUrl,
      usernameHash: username === 'anonymous' ? undefined : crypto.createHash('sha256').update(username).digest('hex').slice(0, 12),
      statusCode: res.statusCode, userAgent: req.get('user-agent')?.slice(0, 200), requestId: requestId(req),
    });
  });
  next();
}

function createHandler(dimension: LimiterDimension, windowMs: number) {
  return (req: Request, res: Response) => {
    const retryAfter = retryAfterSeconds(req, windowMs);
    res.setHeader('Retry-After', String(retryAfter));
    logRateLimitEvent(req, dimension, retryAfter);
    res.status(429).json({ success: false, code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试', dimension, retryAfterSeconds: retryAfter, requestId: requestId(req) });
  };
}

function makeLimiter(dimension: LimiterDimension, options: { enabled: boolean; windowMs: number; max: number; keyGenerator?: (req: Request) => string; skipSuccessfulRequests?: boolean }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs, max: options.max, keyGenerator: options.keyGenerator, skip: () => !options.enabled,
    skipSuccessfulRequests: options.skipSuccessfulRequests, handler: createHandler(dimension, options.windowMs),
    standardHeaders: 'draft-7', legacyHeaders: false,
  });
}

export function createRateLimiters(config = getRateLimitConfig()) {
  if (config.diagnostics) {
    console.info('[rate-limit] diagnostics enabled', { api: config.api, loginIp: config.loginIp, loginAccount: config.loginAccount });
  }
  return {
    apiLimiter: makeLimiter('api', config.api),
    loginIpLimiter: makeLimiter('login_ip', { ...config.loginIp, keyGenerator: (req) => ipKeyGenerator(req.ip || '') }),
    loginAccountLimiter: makeLimiter('login_account', { ...config.loginAccount, keyGenerator: (req) => normalizeLoginUsername(req.body?.username), skipSuccessfulRequests: true }),
    passwordChangeLimiter: makeLimiter('password_change', { enabled: true, windowMs: 60 * 60_000, max: 3 }),
  };
}

export const rateLimitConfig = getRateLimitConfig();
export const { apiLimiter, loginIpLimiter, loginAccountLimiter, passwordChangeLimiter } = createRateLimiters(rateLimitConfig);
