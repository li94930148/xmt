import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { loginV1RequestSchema, refreshRequestSchema } from '../../../../shared/schema/auth.schema.js';
import { sendV1Error, sendV1Success } from '../../../utils/response.js';
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

export class AuthV1Controller {
  constructor(private readonly service: AuthV1Service) {}

  login = async (req: Request, res: Response) => {
    try {
      const input = loginV1RequestSchema.parse(req.body);
      const userAgent = typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 255)
        : null;
      res.setHeader('Cache-Control', 'no-store');
      return sendV1Success(req, res, await this.service.login(input, userAgent));
    } catch (error) {
      return controllerError(req, res, error);
    }
  };

  refresh = async (req: Request, res: Response) => {
    try {
      const input = refreshRequestSchema.parse(req.body);
      res.setHeader('Cache-Control', 'no-store');
      return sendV1Success(req, res, await this.service.refresh(input.refreshToken));
    } catch (error) {
      return controllerError(req, res, error);
    }
  };

  logout = async (_req: Request, res: Response) => {
    await this.service.logout(identity(res));
    return sendV1Success(_req, res, null);
  };

  sessions = async (req: Request, res: Response) => {
    return sendV1Success(req, res, await this.service.sessions(identity(res)));
  };
}
