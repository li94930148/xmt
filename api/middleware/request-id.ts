import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

function normalizeRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized && normalized.length <= 128 ? normalized : randomUUID();
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  req.requestId = normalizeRequestId(req.headers['x-request-id']);
  res.setHeader('X-Request-ID', req.requestId);
  next();
}
