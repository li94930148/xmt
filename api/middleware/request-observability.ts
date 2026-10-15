import type { Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';
import { apiLogger } from '../observability/logger.js';

type RequestLogLogger = Pick<Logger, 'info' | 'warn' | 'error'>;

function moduleName(req: Request) {
  const segments = req.baseUrl.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const candidate = segments[apiIndex >= 0 ? apiIndex + 1 : 0];
  return candidate && /^[a-z][a-z0-9-]{0,63}$/i.test(candidate) ? candidate : 'api';
}

function operationName(req: Request) {
  const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
  return `${req.method.toUpperCase()} ${route.slice(0, 160)}`;
}

function safeUserId(req: Request) {
  const userId = Number(req.user?.id);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : undefined;
}

function safeErrorCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined;
  const body = payload as Record<string, unknown>;
  const nestedError = body.error && typeof body.error === 'object'
    ? body.error as Record<string, unknown>
    : undefined;
  const code = typeof body.code === 'string' ? body.code : nestedError?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : undefined;
}

export function requestObservability(logger: RequestLogLogger = apiLogger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    let errorCode: string | undefined;
    const originalJson = res.json.bind(res);
    res.json = ((payload: unknown) => {
      if (res.statusCode >= 400) errorCode = safeErrorCode(payload);
      return originalJson(payload);
    }) as Response['json'];

    res.once('finish', () => {
      const statusCode = res.statusCode;
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const fields = {
        requestId: req.requestId,
        userId: safeUserId(req),
        module: moduleName(req),
        operation: operationName(req),
        statusCode,
        durationMs: Math.round(elapsedMs * 1000) / 1000,
        ...(errorCode ? { error: { code: errorCode } } : {}),
      };

      if (statusCode >= 500) logger.error(fields, 'api.request.completed');
      else if (statusCode >= 400) logger.warn(fields, 'api.request.completed');
      else logger.info(fields, 'api.request.completed');
    });

    next();
  };
}
