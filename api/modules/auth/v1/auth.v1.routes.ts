import express, { type NextFunction, type Request, type Response } from 'express';
import { sendV1Error } from '../../../utils/response.js';
import { AuthV1ServiceError, type AuthV1Service } from './auth.v1.service.js';
import type { AuthV1Controller } from './auth.v1.controller.js';
import { authMetricsService } from '../events/index.js';

function bearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null;
  return match?.[1]?.trim() || null;
}

function authenticateV1(service: AuthV1Service, webMigrationEnabled: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.authV1 = await service.authenticate(bearerToken(req));
      next();
    } catch (error) {
      if (error instanceof AuthV1ServiceError && error.code === 'SESSION_REVOKED') {
        if (webMigrationEnabled) {
          authMetricsService.countExpired({ requestId: req.requestId, mode: 'v1-web', clientType: 'web', reason: 'session_revoked' });
        }
        return sendV1Error(req, res, {
          code: 'AUTH_SESSION_REVOKED',
          message: '会话已失效，请重新登录',
        }, 401);
      }
      if (error instanceof AuthV1ServiceError && error.code === 'SESSION_EXPIRED') {
        if (webMigrationEnabled) {
          authMetricsService.countExpired({ requestId: req.requestId, mode: 'v1-web', clientType: 'web', reason: 'session_expired' });
        }
        return sendV1Error(req, res, {
          code: 'AUTH_SESSION_EXPIRED',
          message: '会话已过期，请重新登录',
        }, 401);
      }
      return sendV1Error(req, res, { code: 'AUTH_REQUIRED', message: '未登录或登录已失效' }, 401);
    }
  };
}

export function createAuthV1Router(
  controller: AuthV1Controller,
  service: AuthV1Service,
  webMigrationEnabled = false,
) {
  const router = express.Router();
  const authenticate = authenticateV1(service, webMigrationEnabled);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', authenticate, controller.logout);
  router.get('/sessions', authenticate, controller.sessions);
  return router;
}
