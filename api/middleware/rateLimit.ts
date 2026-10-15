import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { apiLogger } from '../observability/logger.js';

type RateLimitLogger = Pick<Logger, 'debug' | 'info' | 'warn'>;

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

function logRateLimitEvent(req: Request, dimension: LimiterDimension, retryAfter: number, logger: RateLimitLogger) {
  logger.warn({
    requestId: requestId(req),
    module: dimension.startsWith('login') ? 'auth' : 'api',
    operation: 'rate_limit.triggered',
    limiter: dimension,
    method: req.method,
    retryAfterSeconds: retryAfter,
    error: { code: 'RATE_LIMITED' },
  }, 'api.request.rate_limited');
}

export function createLogFailedLogin(logger: RateLimitLogger = apiLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.once('finish', () => {
      if (res.statusCode < 400 || res.statusCode === 429) return;
      logger.warn({
        requestId: requestId(req),
        module: 'auth',
        operation: 'login.failed',
        method: req.method,
        statusCode: res.statusCode,
      }, 'api.authentication.failed');
    });
    next();
  };
}

export const logFailedLogin = createLogFailedLogin();

function createHandler(dimension: LimiterDimension, windowMs: number, logger: RateLimitLogger) {
  return (req: Request, res: Response) => {
    const retryAfter = retryAfterSeconds(req, windowMs);
    res.setHeader('Retry-After', String(retryAfter));
    logRateLimitEvent(req, dimension, retryAfter, logger);
    res.status(429).json({ success: false, code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试', dimension, retryAfterSeconds: retryAfter, requestId: requestId(req) });
  };
}

function makeLimiter(dimension: LimiterDimension, options: { enabled: boolean; windowMs: number; max: number; keyGenerator?: (req: Request) => string; skipSuccessfulRequests?: boolean }, logger: RateLimitLogger): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs, max: options.max, keyGenerator: options.keyGenerator, skip: () => !options.enabled,
    skipSuccessfulRequests: options.skipSuccessfulRequests, handler: createHandler(dimension, options.windowMs, logger),
    standardHeaders: 'draft-7', legacyHeaders: false,
  });
}

export function createRateLimiters(config = getRateLimitConfig(), logger: RateLimitLogger = apiLogger) {
  if (config.diagnostics) {
    logger.debug({ api: config.api, loginIp: config.loginIp, loginAccount: config.loginAccount }, 'api.rate_limit.diagnostics');
  }
  return {
    apiLimiter: makeLimiter('api', config.api, logger),
    loginIpLimiter: makeLimiter('login_ip', { ...config.loginIp, keyGenerator: (req) => ipKeyGenerator(req.ip || '') }, logger),
    loginAccountLimiter: makeLimiter('login_account', { ...config.loginAccount, keyGenerator: (req) => normalizeLoginUsername(req.body?.username), skipSuccessfulRequests: true }, logger),
    passwordChangeLimiter: makeLimiter('password_change', { enabled: true, windowMs: 60 * 60_000, max: 3 }, logger),
  };
}

export const rateLimitConfig = getRateLimitConfig();
export const { apiLimiter, loginIpLimiter, loginAccountLimiter, passwordChangeLimiter } = createRateLimiters(rateLimitConfig);
