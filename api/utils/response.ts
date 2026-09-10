import type { Request, Response } from 'express';
import type { ApiErrorCode } from '@shared/schema/error.schema';
import type { Pagination } from '@shared/schema/pagination.schema';

// 统一 API 响应格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: ApiErrorCode;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

// 成功响应
export function sendSuccess<T>(res: Response, data?: T, message?: string, statusCode = 200) {
  const response: ApiResponse<T> = { success: true };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  return res.status(statusCode).json(response);
}

// 带分页的成功响应
export function sendSuccessWithPagination<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message?: string
) {
  const response: ApiResponse<T[]> = {
    success: true,
    data,
    pagination: { page, limit, total }
  };
  if (message) response.message = message;
  return res.status(200).json(response);
}

// 错误响应
export function sendError(res: Response, error: string, statusCode = 400) {
  const response: ApiResponse = { success: false, error };
  return res.status(statusCode).json(response);
}

// 未授权响应
export function sendUnauthorized(res: Response, message = '未授权') {
  return sendError(res, message, 401);
}

// 禁止访问响应
export function sendForbidden(res: Response, message = '无权限执行此操作') {
  return sendError(res, message, 403);
}

// 未找到响应
export function sendNotFound(res: Response, message = '资源不存在') {
  return sendError(res, message, 404);
}

// 服务器错误响应（不泄露内部错误信息）
export function sendServerError(res: Response, message = '服务器内部错误') {
  return sendError(res, message, 500);
}

// 新路由应使用固定安全文案和错误码；内部异常仅记录类型，避免日志二次泄露绑定参数。
export function sendSafeServerError(
  res: Response,
  message = '服务器内部错误',
  context = 'API',
  error?: unknown,
) {
  const errorName = error instanceof Error ? error.name : typeof error;
  console.error(`[${context}] internal request error`, { errorName });
  return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message });
}

/**
 * Removes implementation details from legacy route failures before they leave
 * the process. Older routes still return `{ message, error }`; libsql errors
 * make `sql` and `params` enumerable, so serializing those objects leaks data.
 */
export function sanitizeServerErrorPayload(payload: unknown, requestId?: string): unknown {
  if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, 'error')) {
    return payload;
  }

  const { error, ...safePayload } = payload as Record<string, unknown>;
  const errorName = error instanceof Error ? error.name : typeof error;
  console.error('[API] internal request error', { requestId, errorName });
  return { ...safePayload, success: false, code: 'INTERNAL_ERROR' };
}

export type V1ResponseMeta = Partial<Pagination> & Record<string, unknown>;

export function sendV1Success<T>(
  req: Request,
  res: Response,
  data: T,
  meta: V1ResponseMeta = {},
  statusCode = 200,
) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: { ...meta, requestId: req.requestId },
  });
}

export function sendV1Error(
  req: Request,
  res: Response,
  error: { code: ApiErrorCode; message: string; details?: unknown },
  statusCode: number,
) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      requestId: req.requestId,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}
