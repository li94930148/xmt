import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { apiLogger } from '../observability/logger.js';
import { sendV1Error } from '../utils/response.js';

type RequestErrorLogger = Pick<typeof apiLogger, 'error' | 'warn'>;
const safeErrorNames = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'AggregateError',
  'DatabaseError', 'ValidationError', 'HttpError', 'AbortError', 'TimeoutError',
]);

function isPayloadTooLarge(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; statusCode?: unknown; type?: unknown };
  return value.type === 'entity.too.large' || value.status === 413 || value.statusCode === 413;
}

function safeErrorName(error: unknown) {
  return error instanceof Error && safeErrorNames.has(error.name) ? error.name : 'UnknownError';
}

function safeRequestId(value: string | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export function createRequestErrorHandler(logger: RequestErrorLogger = apiLogger): ErrorRequestHandler {
  return (error: unknown, req: Request, res: Response, next: NextFunction) => {
    const payloadTooLarge = isPayloadTooLarge(error);
    const status = payloadTooLarge ? 413 : 500;
    const errorName = safeErrorName(error);
    const details = {
      module: 'http',
      operation: 'request.failed',
      requestId: safeRequestId(req.requestId),
      method: req.method,
      path: typeof req.route?.path === 'string' ? req.route.path : 'unmatched',
      status,
      error: { code: payloadTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR', name: errorName },
    };

    if (payloadTooLarge) logger.warn(details, 'api.http.request_rejected');
    else logger.error(details, 'api.http.request_failed');

    if (res.headersSent) {
      next(error);
      return;
    }
    if (req.path.startsWith('/api/v1/')) {
      sendV1Error(req, res, {
        code: payloadTooLarge ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message: payloadTooLarge ? '文件或内容过大，请精简后重试' : '暂时无法完成操作，请稍后重试。',
      }, status);
      return;
    }
    if (!payloadTooLarge) {
      res.status(status).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: '请稍后重试。',
      });
      return;
    }
    res.status(status).json({
      success: false,
      error: '内容过大',
      message: '文件或内容过大，请精简后重试',
    });
  };
}

export const requestErrorHandler = createRequestErrorHandler();
