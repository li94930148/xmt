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
import type { AuthMetricsService } from '../events/auth-metrics.service.js';
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
  metrics: AuthMetricsService;
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
        const context = { requestId: req.requestId, userId: result.data.user.id, sessionId: result.data.session.id, mode: 'v1-web' as const, clientType: input.client.type };
        this.webOptions.metrics.recordRolloutDecision({ ...context, success: true, reason: 'allowlist' });
        this.webOptions.metrics.recordSessionCreated(context);
        this.webOptions.metrics.countLoginSuccess(context);
        return sendV1Success(req, res, result.data);
      }
      return sendV1Success(req, res, await this.service.login(input, userAgent));
    } catch (error) {
      if (this.webOptions?.enabled) {
        this.webOptions.metrics.countLoginFailed({
          requestId: req.requestId,
          mode: 'v1-web',
          clientType: req.body?.client?.type,
          reason: error instanceof AuthV1ServiceError ? error.code.toLowerCase() : 'internal_error',
        });
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
          this.webOptions.metrics.countCsrfFailed({ requestId: req.requestId, userId: migrationUserId, sessionId, mode: 'v1-web', clientType: 'web', reason: 'csrf_failed' });
          return sendV1Error(req, res, { code: 'PERMISSION_DENIED', message: '请求验证失败' }, 403);
        }
        const result = await this.service.refreshWeb(refreshToken);
        const csrfToken = this.webOptions.csrfService.generateToken(result.data.session.id);
        setAuthRefreshCookie(res, result.refreshToken, this.webOptions.cookieConfig);
        setAuthCsrfCookie(res, csrfToken, this.webOptions.cookieConfig);
        this.webOptions.metrics.countRefreshSuccess({ requestId: req.requestId, userId: migrationUserId, sessionId, mode: 'v1-web', clientType: 'web' });
        return sendV1Success(req, res, result.data);
      }
      const input = refreshRequestSchema.parse(req.body);
      return sendV1Success(req, res, await this.service.refresh(input.refreshToken));
    } catch (error) {
      if (this.webOptions?.enabled) {
        if (error instanceof AuthV1ServiceError && error.code === 'REFRESH_REUSED') {
          this.webOptions.metrics.countTokenReuse({ requestId: req.requestId, userId: migrationUserId, mode: 'v1-web', clientType: 'web', reason: 'refresh_reused' });
        } else {
          this.webOptions.metrics.countRefreshFailed({ requestId: req.requestId, userId: migrationUserId, mode: 'v1-web', clientType: 'web', reason: error instanceof AuthV1ServiceError ? error.code.toLowerCase() : 'internal_error' });
        }
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
        const context = { requestId: req.requestId, userId: currentIdentity.userId, sessionId: currentIdentity.sessionId, mode: 'v1-web' as const, clientType: 'web' as const };
        this.webOptions.metrics.recordSessionRevoked({ ...context, reason: 'logout' });
        this.webOptions.metrics.countLogoutSuccess(context);
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
