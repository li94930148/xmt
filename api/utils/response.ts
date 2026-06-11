import { Response } from 'express';

// 统一 API 响应格式
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
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
