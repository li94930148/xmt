import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  loginV1RequestSchema,
  refreshRequestSchema,
  refreshWebRequestSchema,
} from '../../../../shared/schema/auth.schema.js';
import { sendV1Error, sendV1Success } from '../../../utils/response.js';
import {
  AUTH_CSRF_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
  clearAuthCsrfCookie,
  clearAuthRefreshCookie,
  setAuthCsrfCookie,
  setAuthRefreshCookie,
  type AuthCookieConfig,
} from '../web/auth-cookie.config.js';
import type { CsrfService } from '../web/csrf.service.js';
import type { AuthMigrationLogger } from '../rollout/auth-migration.logger.js';
import type { AuthMigrationMetrics } from '../rollout/auth-migration.metrics.js';
import type { AuthRolloutService } from '../rollout/auth-rollout.service.js';
import { AuthV1ServiceError, type AuthV1Identity, type AuthV1Service } from './auth.v1.service.js';

function serviceError(req: Request, res: Response, error: AuthV1ServiceError) {
  if (error.code === 'INVALID_CREDENTIALS' || error.code === 'ACCOUNT_DISABLED') {
    return sendV1Error(req, res, {
      code: 'AUTH_INVALID_CREDENTIALS',
      message: '用户名或密码错误',
    }, 401);
  }
  if (error.code === 'REFRESH_REUSED') {
    return sendV1Error(req, res, {
      code: 'AUTH_REFRESH_REUSED',
      message: '认证状态已失效，请重新登录',
    }, 401);
  }
  if (error.code === 'REFRESH_INVALID') {
    return sendV1Error(req, res, {
      code: 'AUTH_REFRESH_INVALID',
      message: '认证状态已失效，请重新登录',
    }, 401);
  }
  if (error.code === 'SESSION_REVOKED') {
    return sendV1Error(req, res, {
      code: 'AUTH_SESSION_REVOKED',
      message: '会话已失效，请重新登录',
    }, 401);
  }
  if (error.code === 'SESSION_EXPIRED') {
    return sendV1Error(req, res, {
      code: 'AUTH_SESSION_EXPIRED',
      message: '会话已过期，请重新登录',
    }, 401);
  }
  if (error.code === 'WEB_NOT_ALLOWED') {
    return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '当前账号不在测试范围内' }, 403);
  }
  return sendV1Error(req, res, { code: 'AUTH_REQUIRED', message: '未登录或登录已失效' }, 401);
}

function controllerError(req: Request, res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return sendV1Error(req, res, {
      code: 'VALIDATION_ERROR',
      message: '请求参数不合法',
      details: error.flatten(),
    }, 400);
  }
  if (error instanceof AuthV1ServiceError) return serviceError(req, res, error);
  return sendV1Error(req, res, { code: 'INTERNAL_ERROR', message: '服务器内部错误' }, 500);
}

function identity(res: Response): AuthV1Identity {
  return res.locals.authV1 as AuthV1Identity;
}

type AuthV1WebOptions = {
  enabled: boolean;
  rolloutService: AuthRolloutService;
  allowedOrigins: ReadonlySet<string>;
  cookieConfig: AuthCookieConfig;
  csrfService: CsrfService;
  metrics: AuthMigrationMetrics;
  logger: AuthMigrationLogger;
};

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator <= 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Malformed cookies are treated as missing credentials.
    }
  }
  return cookies;
}

function hasTrustedOrigin(req: Request, options: AuthV1WebOptions): boolean {
  const origin = req.headers.origin;
  return typeof origin === 'string' && options.allowedOrigins.has(origin);
}

function csrfHeader(req: Request): string | undefined {
  const value = req.headers['x-xmt-csrf'];
  return typeof value === 'string' ? value : undefined;
}

export class AuthV1Controller {
  constructor(
    private readonly service: AuthV1Service,
    private readonly webOptions?: AuthV1WebOptions,
  ) {}

  login = async (req: Request, res: Response) => {
    try {
      const input = loginV1RequestSchema.parse(req.body);
      const userAgent = typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 255)
        : null;
      res.setHeader('Cache-Control', 'no-store');
      if (this.webOptions?.enabled) {
        if (!hasTrustedOrigin(req, this.webOptions)) {
          return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '请求来源不受信任' }, 403);
        }
        const result = await this.service.loginWeb(input, userAgent, this.webOptions.rolloutService);
        const csrfToken = this.webOptions.csrfService.generateToken(result.data.session.id);
        setAuthRefreshCookie(res, result.refreshToken, this.webOptions.cookieConfig);
        setAuthCsrfCookie(res, csrfToken, this.webOptions.cookieConfig);
        this.webOptions.metrics.increment('v1_login_count');
        this.webOptions.logger.record({ event: 'auth.migration.login', requestId: req.requestId, userId: result.data.user.id, mode: 'v1-web', outcome: 'success' });
        return sendV1Success(req, res, result.data);
      }
      return sendV1Success(req, res, await this.service.login(input, userAgent));
    } catch (error) {
      if (this.webOptions?.enabled && !(error instanceof AuthV1ServiceError)) {
        this.webOptions.logger.record({ event: 'auth.migration.rollback', requestId: req.requestId, mode: 'v1-web', outcome: 'failed', reason: 'login_failed' });
      }
      return controllerError(req, res, error);
    }
  };

  refresh = async (req: Request, res: Response) => {
    let migrationUserId: number | undefined;
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (this.webOptions?.enabled) {
        refreshWebRequestSchema.parse(req.body ?? {});
        if (!hasTrustedOrigin(req, this.webOptions)) {
          return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '请求来源不受信任' }, 403);
        }
        const cookies = parseCookies(req.headers.cookie);
        const refreshToken = cookies.get(AUTH_REFRESH_COOKIE_NAME);
        if (!refreshToken) throw new AuthV1ServiceError('REFRESH_INVALID');
        const refreshIdentity = await this.service.resolveWebRefreshIdentity(refreshToken);
        const { sessionId } = refreshIdentity;
        migrationUserId = refreshIdentity.userId;
        if (!this.webOptions.csrfService.verifyDoubleSubmit(
          sessionId,
          cookies.get(AUTH_CSRF_COOKIE_NAME),
          csrfHeader(req),
        )) {
          this.webOptions.metrics.increment('refresh_failed');
          this.webOptions.metrics.increment('csrf_failed');
          this.webOptions.logger.record({ event: 'auth.migration.refresh', requestId: req.requestId, userId: migrationUserId, mode: 'v1-web', outcome: 'failed', reason: 'csrf_failed' });
          return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '请求验证失败' }, 403);
        }
        const result = await this.service.refreshWeb(refreshToken);
        const csrfToken = this.webOptions.csrfService.generateToken(result.data.session.id);
        setAuthRefreshCookie(res, result.refreshToken, this.webOptions.cookieConfig);
        setAuthCsrfCookie(res, csrfToken, this.webOptions.cookieConfig);
        this.webOptions.metrics.increment('refresh_success');
        this.webOptions.logger.record({ event: 'auth.migration.refresh', requestId: req.requestId, userId: migrationUserId, mode: 'v1-web', outcome: 'success' });
        return sendV1Success(req, res, result.data);
      }
      const input = refreshRequestSchema.parse(req.body);
      return sendV1Success(req, res, await this.service.refresh(input.refreshToken));
    } catch (error) {
      if (this.webOptions?.enabled) {
        this.webOptions.metrics.increment('refresh_failed');
        if (error instanceof AuthV1ServiceError && error.code === 'REFRESH_REUSED') {
          this.webOptions.metrics.increment('token_reuse_detected');
        }
        if (error instanceof AuthV1ServiceError && (error.code === 'SESSION_EXPIRED' || error.code === 'SESSION_REVOKED')) {
          this.webOptions.metrics.increment('expired_count');
        }
        this.webOptions.logger.record({ event: 'auth.migration.refresh', requestId: req.requestId, userId: migrationUserId, mode: 'v1-web', outcome: 'failed', reason: error instanceof AuthV1ServiceError ? error.code.toLowerCase() : 'internal_error' });
      }
      if (
        this.webOptions?.enabled
        && error instanceof AuthV1ServiceError
        && (error.code === 'REFRESH_INVALID' || error.code === 'REFRESH_REUSED')
      ) {
        clearAuthRefreshCookie(res, this.webOptions.cookieConfig);
        clearAuthCsrfCookie(res, this.webOptions.cookieConfig);
      }
      return controllerError(req, res, error);
    }
  };

  logout = async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (this.webOptions?.enabled) {
        if (!hasTrustedOrigin(req, this.webOptions)) {
          return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '请求来源不受信任' }, 403);
        }
        const currentIdentity = identity(res);
        const cookies = parseCookies(req.headers.cookie);
        if (!this.webOptions.csrfService.verifyDoubleSubmit(
          currentIdentity.sessionId,
          cookies.get(AUTH_CSRF_COOKIE_NAME),
          csrfHeader(req),
        )) {
          return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '请求验证失败' }, 403);
        }
        await this.service.logout(currentIdentity);
        clearAuthRefreshCookie(res, this.webOptions.cookieConfig);
        clearAuthCsrfCookie(res, this.webOptions.cookieConfig);
        this.webOptions.metrics.increment('logout_success');
        this.webOptions.logger.record({ event: 'auth.migration.logout', requestId: req.requestId, userId: currentIdentity.userId, mode: 'v1-web', outcome: 'success' });
        return sendV1Success(req, res, null);
      }
      await this.service.logout(identity(res));
      return sendV1Success(req, res, null);
    } catch (error) {
      return controllerError(req, res, error);
    }
  };

  sessions = async (req: Request, res: Response) => {
    return sendV1Success(req, res, await this.service.sessions(identity(res)));
  };
}
